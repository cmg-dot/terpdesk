import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";

/**
 * Positional isolation for team (two-interpreter) jobs.
 *
 * Every booking action works on ONE position: the one its offer was sent for (`requests.data.offerPositions`).
 * `lockRequestForPosition` takes a row lock on the request first, so two actions on the same job (two interpreters
 * accepting at once, an accept racing a give-back) run one after the other and each sees the other's result.
 *
 * SERVER ONLY. Call inside a transaction.
 */

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LockedRequest {
  status: string;
  data: Record<string, unknown>;
  createdAt: Date;
  offerPositions: Record<string, number>;
}

export const positionOfOffer = (offerPositions: Record<string, number>, offerId: string): 1 | 2 =>
  offerPositions[offerId] === 2 ? 2 : 1;

/** Locks the request row for the rest of the transaction and returns its fresh data. Null if it no longer exists. */
export async function lockRequestForPosition(tx: DbTx, requestId: string): Promise<LockedRequest | null> {
  const [row] = await tx
    .select({ status: requests.status, data: requests.data, createdAt: requests.createdAt })
    .from(requests)
    .where(eq(requests.id, requestId))
    .for("update");
  if (!row) return null;
  const data = (row.data ?? {}) as Record<string, unknown>;
  const raw = data.offerPositions;
  const offerPositions = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
  return { status: row.status, data, createdAt: row.createdAt, offerPositions };
}

/**
 * True when someone OTHER than `interpreterId` already holds `position` (an accepted offer for it, or a reserved
 * slot). Call after `lockRequestForPosition` so the answer cannot change before the transaction commits.
 */
export async function isPositionTakenByOther(
  tx: DbTx,
  requestId: string,
  locked: LockedRequest,
  position: 1 | 2,
  interpreterId: string,
): Promise<boolean> {
  const accepted = await tx
    .select({ id: offers.id, interpreterId: offers.interpreterId })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
  if (accepted.some((o) => o.interpreterId !== interpreterId && positionOfOffer(locked.offerPositions, o.id) === position)) {
    return true;
  }
  const slots = Array.isArray(locked.data.slots) ? (locked.data.slots as { positionIndex?: number; reservedBy?: string | null }[]) : [];
  const slot = slots.find((s) => s.positionIndex === position);
  return Boolean(slot?.reservedBy && slot.reservedBy !== interpreterId);
}
