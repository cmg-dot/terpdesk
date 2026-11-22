import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { logError } from "@/lib/logError";
import { sweepExpiredOffers } from "@/lib/offerSweep";

/**
 * Expires offers whose response deadline has passed, even when nobody opens that request: an agency browser's 15-second pulse
 * (actions/pulse.ts) calls this, so a lapsed offer reaches staff as a banner and pop-up without a scheduled job. It runs at most once a
 * minute per server, and only reads anything when an offer is actually overdue. Safe to run on several servers or tabs at once: each
 * offer is expired by a conditional update, so only one of them announces it (offerExpiry.ts). SERVER ONLY.
 */

export const SWEEP_MIN_GAP_MS = 60_000;

/** True when enough time has passed since the last sweep. Pure. */
export const sweepDue = (nowMs: number, lastMs: number, gapMs: number = SWEEP_MIN_GAP_MS): boolean => nowMs - lastMs >= gapMs;

let lastSweepAt = 0;

/** Test hook: forget when the last sweep ran. */
export const resetSweepThrottle = (): void => {
  lastSweepAt = 0;
};

export async function sweepOnPulse(now: Date = new Date()): Promise<void> {
  if (!sweepDue(now.getTime(), lastSweepAt)) return;
  lastSweepAt = now.getTime();
  try {
    const overdue = await db
      .select({ requestId: offers.requestId })
      .from(offers)
      .where(and(eq(offers.status, "pending"), lte(offers.expiresAt, now)));
    if (overdue.length === 0) return;
    const requestIds = Array.from(new Set(overdue.map((o) => o.requestId)));
    const dbRows = await db.select().from(requests).where(inArray(requests.id, requestIds));
    const siblings = await db
      .select({ id: offers.id, requestId: offers.requestId, interpreterId: offers.interpreterId, status: offers.status, expiresAt: offers.expiresAt })
      .from(offers)
      .where(inArray(offers.requestId, requestIds));
    await sweepExpiredOffers(dbRows, siblings.map((o) => ({ ...o, state: o.status })), now);
  } catch (err) {
    logError("sweepOnPulse", err);
  }
}
