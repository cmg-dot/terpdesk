import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { offers } from "@/db/schema";
import { alertAgency } from "@/lib/lifecycleAlerts";
import { logError } from "@/lib/logError";
import { positionLabel, positionOfOffer } from "@/lib/positions";
import { logActivity } from "@/lib/requestActivity";
import type { ActivityInput } from "@/lib/requestActivity";

/**
 * A pending offer whose response deadline passed. Staff are told (a banner and pop-up, the bell, an agency-only history line) exactly
 * once, by whichever request first notices it: `claimExpiredOffer` is a conditional update, so two staff browsers (or two servers)
 * sweeping at the same moment cannot both announce it. (The response-window rules for a NEW offer are in lib/offerExpiry.ts.) SERVER ONLY.
 */

/** Flips one pending offer to expired. True only for the caller that actually changed it (the one that should announce it). */
export async function claimExpiredOffer(offerId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(offers)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(offers.id, offerId), eq(offers.status, "pending")))
    .returning({ id: offers.id });
  return rows.length > 0;
}

/**
 * Staff need to hear about an expiry only while the position can still be re-offered: the deadline has passed but the appointment has
 * not started. An offer left pending on a finished appointment is housekeeping, not news. Pure.
 */
export function expiryNeedsStaff(now: Date, offer: { expiresAt: Date | string | null | undefined; startsAt: Date | string | null | undefined }): boolean {
  const deadline = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
  const start = offer.startsAt ? new Date(offer.startsAt).getTime() : NaN;
  return Number.isFinite(deadline) && deadline <= now.getTime() && Number.isFinite(start) && start > now.getTime();
}

export interface ExpiredOffer {
  offerId: string;
  requestId: string;
  interpreterId: string | null;
  /** The request's data (for the position number the offer was for). */
  data: unknown;
}

/** What announcing needs from outside, so a test can run the real flow with stand-ins. */
export interface ExpiryEffects {
  alert: (params: { event: "offer_expired"; requestId: string; interpreterId: string; positionNumber: number }) => Promise<void>;
  activity: (entry: ActivityInput) => Promise<void>;
}

const liveEffects: ExpiryEffects = { alert: alertAgency, activity: logActivity };

/** The staff banner, bell and history line for one expired offer. Never throws: the offer is already expired. */
export async function announceExpiredOffer(expired: ExpiredOffer, fx: ExpiryEffects = liveEffects): Promise<void> {
  try {
    const positions = ((expired.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
    const position = positionOfOffer(positions, expired.offerId);
    if (expired.interpreterId) await fx.alert({ event: "offer_expired", requestId: expired.requestId, interpreterId: expired.interpreterId, positionNumber: position });
    await fx.activity({
      requestId: expired.requestId,
      interpreterId: expired.interpreterId,
      audience: "agency",
      kind: "offer_expired",
      message: `Offer expired, no answer (${positionLabel(expired.data, position)})`,
      actorLabel: "terpDESK",
    });
  } catch (err) {
    logError("announceExpiredOffer", err);
  }
}
