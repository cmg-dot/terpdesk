import { and, eq, inArray } from "drizzle-orm";
import { offers, requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { interpreterHoldsOtherPosition, lockRequestForPosition, OTHER_POSITION_MESSAGE, positionOfOffer } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { isActivePosition, readPositions } from "@/lib/positions";
import { assignmentFields, rebuildSlots, staffingFacts, statusAfterBooking } from "@/lib/staffing";
import type { SlotRecord } from "@/lib/staffing";
import type { JobPosition } from "@/lib/validation/directAssign";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The booking transaction behind "Directly assign interpreter" (agency override). It skips the offer / acceptance
 * round trip: the interpreter ends up booked exactly as if they had accepted. Runs inside the caller's transaction,
 * under the request row lock (see positionClaim.ts), so it can't race an interpreter accepting at the same moment.
 *
 * Only the chosen position is touched; the job's other positions, their offers and bookings are left alone.
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const PAST_MESSAGE =
  "This appointment's scheduled time has already started or passed, so it can't be assigned. Edit the time to a future date first.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function bookInterpreterDirectly(tx: DbTx, params: DirectAssignParams): Promise<DirectAssignOutcome> {
  const { requestId, interpreterId, interpreterName, positionIndex } = params;
  const now = params.now ?? new Date();

  const locked = await lockRequestForPosition(tx, requestId);
  if (!locked) return { ok: false, error: "This request no longer exists." };
  if (["cancelled", "canceled"].includes(locked.status.toLowerCase())) {
    return { ok: false, error: "This appointment was cancelled." };
  }

  const data = locked.data;
  if (!isActivePosition(data, positionIndex)) return { ok: false, error: "This job has no such position." };

  const { startsAt, endsAt } = resolveRequestTimes({ createdAt: locked.createdAt, data });
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if ((!Number.isNaN(start.getTime()) && start <= now) || (!Number.isNaN(end.getTime()) && end <= now)) {
    return { ok: false, error: PAST_MESSAGE };
  }

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
  // One person can't hold two positions of the same job.
  if (await interpreterHoldsOtherPosition(tx, requestId, locked, positionIndex, interpreterId)) {
    return { ok: false, error: OTHER_POSITION_MESSAGE };
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
  const facts = staffingFacts({ ...data, slotReplacements }, allOffers, { now, includeSlots: true });
  const status = statusAfterBooking(facts, positionIndex);

  const updatedSlots = rebuildSlots({
    ids: readPositions(data).ids,
    existing: slots,
    replacements: slotReplacements,
    booking: { position: positionIndex, offerId: booked.id, interpreterId, interpreterName },
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
        // Positions 1 and 2 have their own name and id fields; later positions keep theirs in the slot record.
        ...assignmentFields(positionIndex, interpreterId, interpreterName),
        // `data` is a loose record, so the spread loses the typed `brief` / `intake` keys.
      } as unknown as RequestData,
      updatedAt: now,
    })
    .where(eq(requests.id, requestId));

  return { ok: true, status, offerId: booked.id, withdrawnOffers: pendingIds.length };
}
