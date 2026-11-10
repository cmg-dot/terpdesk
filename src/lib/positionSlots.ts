import { eq } from "drizzle-orm";
import { offers, requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import type { DbTx } from "@/lib/positionClaim";
import { addPosition, MAX_POSITIONS, readPositions, retirePosition } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";
import { hasLegacyAssignmentAt, staffingFacts, STATUS_PARTIAL, STATUS_UNFILLED, statusAfterWithdraw } from "@/lib/staffing";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Adding and removing interpreter positions on an existing job, inside the caller's transaction and under the request's row
 * lock (so it cannot race an interpreter accepting at the same moment). Allowed while the appointment is under way (extra cover
 * on short notice), but never on a job that is cancelled or closed out.
 *
 * Removing is guarded: a position with someone booked in it, an offer still waiting for an answer, or hours recorded cannot be
 * removed. A removed position's number is retired (never reused), so every other position keeps its offers, hours and history.
 *
 * SERVER ONLY. The caller has already checked the agency role and writes the audit entry.
 */

export type SlotOutcome =
  | { ok: true; positionId: PositionId; count: number; ids: PositionId[]; status: string }
  | { ok: false; error: string };

/** Statuses after which the job's positions are frozen. */
const CLOSED = new Set(["cancelled", "canceled", "completed", "billed"]);
/** The staffing lifecycle's own statuses: the only ones adding or removing a position may change. */
const STAFFING = new Set(["booked", "fully staffed", "assigned", "partially staffed", "needs replacement", "offer awaiting response", "unfilled / draft", "draft"]);
const FILLED = new Set(["booked", "fully staffed", "assigned"]);

const CLOSED_MESSAGE = "This appointment is cancelled or closed out, so its interpreter positions can't be changed.";

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const save = async (tx: DbTx, requestId: string, data: Record<string, unknown>, status: string, now: Date): Promise<void> => {
  const overview = asRecord(data.overview);
  const next = Object.keys(overview).length > 0 ? { ...data, overview: { ...overview, status } } : data;
  await tx.update(requests).set({ status, data: next as unknown as RequestData, updatedAt: now }).where(eq(requests.id, requestId));
};

export async function addSlotTx(tx: DbTx, requestId: string, now: Date = new Date()): Promise<SlotOutcome> {
  const locked = await lockRequestForPosition(tx, requestId);
  if (!locked) return { ok: false, error: "This request no longer exists." };
  if (CLOSED.has(locked.status.toLowerCase())) return { ok: false, error: CLOSED_MESSAGE };

  const { endsAt } = resolveRequestTimes({ createdAt: locked.createdAt, data: locked.data });
  const end = new Date(endsAt);
  if (!Number.isNaN(end.getTime()) && end <= now) return { ok: false, error: "This appointment has already ended, so a position can't be added." };

  const added = addPosition(locked.data);
  if (!added.ok) return { ok: false, error: `A job can have at most ${MAX_POSITIONS} interpreter positions.` };

  // A job that was fully staffed is no longer: the new position is empty.
  const current = locked.status.toLowerCase();
  const status = FILLED.has(current) ? STATUS_PARTIAL : locked.status;
  await save(tx, requestId, added.data, status, now);
  const { count, ids } = readPositions(added.data);
  return { ok: true, positionId: added.id, count, ids, status };
}

export async function removeSlotTx(tx: DbTx, requestId: string, positionId: PositionId, now: Date = new Date()): Promise<SlotOutcome> {
  const locked = await lockRequestForPosition(tx, requestId);
  if (!locked) return { ok: false, error: "This request no longer exists." };
  if (CLOSED.has(locked.status.toLowerCase())) return { ok: false, error: CLOSED_MESSAGE };

  const before = readPositions(locked.data);
  if (!before.ids.includes(positionId)) return { ok: false, error: "That position is no longer part of this job." };
  if (before.count <= 1) return { ok: false, error: "A job needs at least one interpreter position." };

  const allOffers = await tx
    .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status, expiresAt: offers.expiresAt })
    .from(offers)
    .where(eq(offers.requestId, requestId));
  const here = allOffers.filter((o) => positionOfOffer(locked.offerPositions, o.id) === positionId);

  const slots = Array.isArray(locked.data.slots) ? (locked.data.slots as { positionIndex?: number; reservedBy?: string | null }[]) : [];
  const hasBooking =
    here.some((o) => o.status === "accepted") ||
    slots.some((s) => s.positionIndex === positionId && Boolean(s.reservedBy)) ||
    hasLegacyAssignmentAt(locked.data, positionId);
  if (hasBooking) return { ok: false, error: "This position has an interpreter booked. Remove the booking first, then remove the position." };
  if (here.some((o) => o.status === "pending" && new Date(o.expiresAt) > now)) {
    return { ok: false, error: "This position has an offer waiting for an answer. Withdraw the offer first, then remove the position." };
  }
  if (asRecord(locked.data.hoursSubmissions)[String(positionId)] !== undefined) {
    return { ok: false, error: "This position has hours recorded, so it can't be removed." };
  }

  const retired = retirePosition(locked.data, positionId);
  if (!retired.ok) return { ok: false, error: "This position can't be removed." };

  // Re-derive the status from what is left (only the staffing lifecycle's own statuses are touched).
  const current = locked.status.toLowerCase();
  let status = locked.status;
  if (STAFFING.has(current)) {
    const derived = statusAfterWithdraw(staffingFacts(retired.data, allOffers, { now }));
    status = derived === STATUS_UNFILLED && current === "draft" ? locked.status : derived;
  }
  await save(tx, requestId, retired.data, status, now);
  const { count, ids } = readPositions(retired.data);
  return { ok: true, positionId, count, ids, status };
}
