import { and, eq, inArray } from "drizzle-orm";
import { offers, requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import type { JobPosition } from "@/lib/validation/directAssign";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The booking transaction behind "Directly assign interpreter" (agency override). It skips the offer / acceptance
 * round trip: the interpreter ends up booked exactly as if they had accepted. Runs inside the caller's transaction,
 * under the request row lock (see positionClaim.ts), so it can't race an interpreter accepting at the same moment.
 *
 * Only the chosen position is touched; on a team job the other position's offers and booking are left alone.
 * Unlike auto-book it never replaces someone already booked: that booking has to be removed first.
 *
 * SERVER ONLY. The caller has already checked the agency role and that the interpreter is on the agency's roster.
 */

export interface DirectAssignParams {
  requestId: string;
  interpreterId: string;
  interpreterName: string;
  positionIndex: JobPosition;
  now?: Date;
}

export type DirectAssignOutcome =
  | { ok: true; status: string; offerId: string; withdrawnOffers: number }
  | { ok: false; error: string };

interface SlotRecord {
  id?: string;
  positionIndex?: number;
  active?: boolean;
  reservedBy?: string | null;
  interpreterName?: string;
  needsReplacement?: boolean;
  followUp?: boolean;
  [key: string]: unknown;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const PAST_MESSAGE =
  "This appointment's scheduled time has already started or passed, so it can't be assigned. Edit the time to a future date first.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Same test the rest of the booking code uses to tell a team job (two independent positions) from a single one. */
const isTeamJob = (data: Record<string, unknown>): boolean => {
  const details = isRecord(data.details) ? data.details : {};
  return (
    data.slotCount === 2 ||
    details.slotCount === 2 ||
    data.positions === "Team — two independent positions" ||
    data.requiredPositions === 2
  );
};

/** Request status once this position is filled: booked, or what the other position still needs on a team job. */
const statusAfterBooking = (team: boolean, otherBooked: boolean, otherNeedsReplacement: boolean): string => {
  if (!team || otherBooked) return "booked";
  return otherNeedsReplacement ? "Needs replacement" : "Partially staffed";
};

export async function bookInterpreterDirectly(tx: DbTx, params: DirectAssignParams): Promise<DirectAssignOutcome> {
  const { requestId, interpreterId, interpreterName, positionIndex } = params;
  const now = params.now ?? new Date();

  const locked = await lockRequestForPosition(tx, requestId);
  if (!locked) return { ok: false, error: "This request no longer exists." };
  if (["cancelled", "canceled"].includes(locked.status.toLowerCase())) {
    return { ok: false, error: "This appointment was cancelled." };
  }

  const data = locked.data;
  const team = isTeamJob(data);
  if (positionIndex === 2 && !team) return { ok: false, error: "This job has only one position." };

  const { startsAt, endsAt } = resolveRequestTimes({ createdAt: locked.createdAt, data });
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if ((!Number.isNaN(start.getTime()) && start <= now) || (!Number.isNaN(end.getTime()) && end <= now)) {
    return { ok: false, error: PAST_MESSAGE };
  }

  const otherPosition: JobPosition = positionIndex === 1 ? 2 : 1;
  const slots: SlotRecord[] = Array.isArray(data.slots) ? data.slots.filter(isRecord) : [];
  const allOffers = await tx
    .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status })
    .from(offers)
    .where(eq(offers.requestId, requestId));
  const positionOf = (offerId: string) => positionOfOffer(locked.offerPositions, offerId);

  const heldByOffer = allOffers.some((o) => o.status === "accepted" && positionOf(o.id) === positionIndex);
  const heldBySlot = Boolean(slots.find((s) => s.positionIndex === positionIndex)?.reservedBy);
  if (heldByOffer || heldBySlot) {
    return { ok: false, error: "This position is already filled. Remove the current booking first, then assign again." };
  }
  // One person can't hold both positions of a team job.
  if (allOffers.some((o) => o.status === "accepted" && o.interpreterId === interpreterId && positionOf(o.id) !== positionIndex)) {
    return { ok: false, error: "This interpreter is already booked in the other position of this job." };
  }

  // Every offer still waiting on an answer for THIS position is closed (including this interpreter's own, which the
  // assignment replaces). A late click on its email link then finds the offer withdrawn.
  const pendingIds = allOffers.filter((o) => o.status === "pending" && positionOf(o.id) === positionIndex).map((o) => o.id);
  if (pendingIds.length > 0) {
    await tx
      .update(offers)
      .set({ status: "withdrawn", updatedAt: now })
      .where(and(inArray(offers.id, pendingIds), eq(offers.status, "pending")));
  }

  const [booked] = await tx
    .insert(offers)
    .values({ requestId, interpreterId, status: "accepted", expiresAt: Number.isNaN(end.getTime()) ? new Date(now.getTime() + THIRTY_DAYS_MS) : end })
    .returning({ id: offers.id });

  const slotReplacements: Record<string, boolean> = { ...(isRecord(data.slotReplacements) ? (data.slotReplacements as Record<string, boolean>) : {}), [positionIndex]: false };
  const otherBooked =
    allOffers.some((o) => o.status === "accepted" && positionOf(o.id) === otherPosition) ||
    Boolean(slots.find((s) => s.positionIndex === otherPosition)?.reservedBy);
  const status = statusAfterBooking(team, otherBooked, Boolean(slotReplacements[otherPosition]));

  const positions: JobPosition[] = team ? [1, 2] : [1];
  const updatedSlots = positions.map((position): SlotRecord => {
    const current = slots.find((s) => s.positionIndex === position);
    if (position === positionIndex) {
      return { ...current, id: booked.id, positionIndex: position, active: true, reservedBy: interpreterId, interpreterName, needsReplacement: false, followUp: false };
    }
    return { followUp: false, ...current, id: current?.id ?? `slot-${position}`, positionIndex: position, active: true, reservedBy: current?.reservedBy ?? null, needsReplacement: Boolean(slotReplacements[position]) };
  });

  // The mirrored offers list some older records carry must not keep showing a closed offer as pending.
  const withdrawn = new Set(pendingIds);
  const mirroredOffers = Array.isArray(data.offers)
    ? data.offers.map((o: unknown) => (isRecord(o) && typeof o.id === "string" && withdrawn.has(o.id) ? { ...o, status: "withdrawn", state: "withdrawn" } : o))
    : undefined;

  await tx
    .update(requests)
    .set({
      status,
      data: {
        ...data,
        offerPositions: { ...locked.offerPositions, [booked.id]: positionIndex },
        slotReplacements,
        slots: updatedSlots,
        ...(mirroredOffers ? { offers: mirroredOffers } : {}),
        // Each position has its own name and id fields, so Position 2 never fills in Position 1's.
        ...(positionIndex === 1
          ? { assignedInterpreterName: interpreterName, assignedInterpreterId: interpreterId }
          : { position2InterpreterName: interpreterName, position2InterpreterId: interpreterId }),
        // `data` is a loose record, so the spread loses the typed `brief` / `intake` keys.
      } as unknown as RequestData,
      updatedAt: now,
    })
    .where(eq(requests.id, requestId));

  return { ok: true, status, offerId: booked.id, withdrawnOffers: pendingIds.length };
}
