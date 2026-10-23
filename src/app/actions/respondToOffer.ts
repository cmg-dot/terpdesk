"use server";

import { requireInterpreter, FORBIDDEN } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { isPositionTakenByOther, lockRequestForPosition, positionOfOffer } from "@/lib/positionClaim";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";
import { td_conflict } from "./availability";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { alertAgency } from "@/lib/lifecycleAlerts";
import { logActivity } from "@/lib/requestActivity";

type OfferRecord = typeof offers.$inferSelect;

/**
 * Expected refusals (expired, withdrawn, busy-time conflict, ...) are returned, not thrown: in production Next.js
 * hides a thrown server-action message behind a generic "Server Components render" error with only a digest.
 */
export type RespondToOfferResult = { success: true; offer: OfferRecord } | { success: false; error: string };

export async function respondToOffer(
  offerId: string,
  response: 'accept' | 'decline' | 'accepted' | 'declined'
): Promise<RespondToOfferResult> {
  const { interpreterId: sessionInterpreterId } = await requireInterpreter();
  const normResponse = (response === 'accept' || response === 'accepted') ? 'accepted' : 'declined';

  // 1. Fetch offer
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!offer) {
    return { success: false, error: "This offer could not be found. It may have been withdrawn." };
  }
  if (offer.interpreterId !== sessionInterpreterId) throw new Error(FORBIDDEN);

  // 2. Fetch parent request
  const [parentReq] = await db.select().from(requests).where(eq(requests.id, offer.requestId));
  if (!parentReq) {
    return { success: false, error: "The request for this offer no longer exists." };
  }

  const { endsAt } = resolveRequestTimes(parentReq);
  const endsAtDate = new Date(endsAt);
  const now = new Date();

  // 3. Server-side guard: if appointment has ended (now > endsAt), mark offer as expired and reject acceptance
  if (!isNaN(endsAtDate.getTime()) && now > endsAtDate) {
    await db.update(offers)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(offers.id, offerId));

    // Sync cached offers inside requests.data if present
    const existingData = (parentReq.data as any) || {};
    if (Array.isArray(existingData.offers)) {
      existingData.offers = existingData.offers.map((o: any) =>
        o.id === offerId ? { ...o, status: 'expired', state: 'expired', expiredAt: now.toISOString() } : o
      );
      await db.update(requests)
        .set({ data: existingData, updatedAt: now })
        .where(eq(requests.id, offer.requestId));
    }

    revalidatePath('/interpreter-home');
    revalidatePath('/jobs');
    revalidatePath(`/requests/${offer.requestId}`);
    revalidatePath('/requests');
    revalidatePath('/dashboard');

    return { success: false, error: "This offer has expired because the scheduled appointment time has already ended." };
  }

  if (offer.status === 'expired') {
    return { success: false, error: "This offer has already expired." };
  }
  if (offer.status === 'withdrawn') {
    return { success: false, error: "This offer has been withdrawn by the agency." };
  }

  // 4. Hard-block acceptance if there is an overlapping booked reservation or busy block
  if (normResponse === 'accepted') {
    const { startsAt: reqStartsAt, endsAt: reqEndsAt } = resolveRequestTimes(parentReq);
    const conflict = await td_conflict({
      interpreterId: offer.interpreterId,
      startsAtUtc: reqStartsAt,
      endsAtUtc: reqEndsAt,
      excludeRequestId: offer.requestId,
    });

    if (conflict.hasConflict) {
      return { success: false, error: "You cannot accept this job because it conflicts with your scheduled busy time." };
    }
  }

  // 5. One transaction, locked on the request row: only THIS offer's position is touched, and two interpreters
  // (or an accept and a give-back) on the same job are serialised, so neither can overwrite the other.
  const outcome = await db.transaction(async (tx): Promise<{ ok: true; offer: OfferRecord; posIdx: 1 | 2 } | { ok: false; error: string }> => {
    const locked = await lockRequestForPosition(tx, offer.requestId);
    if (!locked) return { ok: false, error: "The request for this offer no longer exists." };
    const existingData = locked.data as Record<string, any>;
    const offerPositions = locked.offerPositions;
    const posIdx = positionOfOffer(offerPositions, offerId);

    if (normResponse === 'accepted' && (await isPositionTakenByOther(tx, offer.requestId, locked, posIdx, offer.interpreterId))) {
      await tx.update(offers).set({ status: 'withdrawn', updatedAt: now }).where(and(eq(offers.id, offerId), eq(offers.status, 'pending')));
      return { ok: false, error: "This position has already been filled by another interpreter." };
    }

    // Only a still-pending, unexpired offer can be answered (an accepted job is handed back with "Give back").
    const [updatedOffer] = await tx.update(offers)
      .set({ status: normResponse, updatedAt: now })
      .where(and(eq(offers.id, offerId), eq(offers.status, 'pending'), gt(offers.expiresAt, now)))
      .returning();
    if (!updatedOffer) return { ok: false, error: "This offer is no longer open. It may have expired, been withdrawn or already been answered." };

    const totalPositions = (existingData.slotCount === 2 || existingData.details?.slotCount === 2 || existingData.positions === "Team — two independent positions" || existingData.requiredPositions === 2) ? 2 : 1;
    const otherPos = posIdx === 1 ? 2 : 1;
    const allReqOffers = await tx.select().from(offers).where(eq(offers.requestId, offer.requestId));

    if (normResponse === 'accepted') {
      // Withdraw any other pending offers for THIS specific position only.
      for (const off of allReqOffers) {
        if (off.id !== updatedOffer.id && positionOfOffer(offerPositions, off.id) === posIdx && off.status === 'pending') {
          await tx.update(offers)
            .set({ status: 'withdrawn', updatedAt: now })
            .where(and(eq(offers.id, off.id), eq(offers.status, 'pending')));
        }
      }

      const updatedSlotReplacements = {
        ...(existingData.slotReplacements || {}),
        [posIdx]: false
      };

      const otherPosBooked = totalPositions === 2 && allReqOffers.some(o =>
        o.id !== updatedOffer.id && positionOfOffer(offerPositions, o.id) === otherPos && o.status === 'accepted'
      );

      let newStatus = 'booked';
      if (totalPositions === 2) {
        if (otherPosBooked) {
          newStatus = 'booked';
        } else if (updatedSlotReplacements[otherPos]) {
          newStatus = 'Needs replacement';
        } else {
          newStatus = 'Partially staffed';
        }
      }

      let updatedOffersArray = existingData.offers;
      if (Array.isArray(updatedOffersArray)) {
        updatedOffersArray = updatedOffersArray.map((o: any) =>
          o.id === offerId ? { ...o, status: 'accepted', state: 'accepted' } : o
        );
      }

      await tx.update(requests)
        .set({
          status: newStatus,
          data: {
            ...existingData,
            slotReplacements: updatedSlotReplacements,
            ...(updatedOffersArray ? { offers: updatedOffersArray } : {})
            // existingData is a loose record, so the spread loses the typed `brief` / `intake` keys.
          } as unknown as RequestData,
          updatedAt: now
        })
        .where(eq(requests.id, offer.requestId));
    } else {
      // Declined
      const remainingAccepted = allReqOffers.filter(o => o.id !== updatedOffer.id && o.status === 'accepted');
      const hasOtherAccepted = remainingAccepted.length > 0;
      const hasPending = allReqOffers.some(o => o.id !== updatedOffer.id && o.status === 'pending' && new Date(o.expiresAt) > now);
      const hasReplacement = Boolean(existingData.slotReplacements?.[1] || existingData.slotReplacements?.[2]);

      // No other live offer for THIS position means it still needs coverage: flag it instead of leaving a draft.
      const hasPendingForPosition = allReqOffers.some(
        o => o.id !== updatedOffer.id && o.status === 'pending' && new Date(o.expiresAt) > now && positionOfOffer(offerPositions, o.id) === posIdx
      );

      let newStatus = 'Needs replacement';
      if (remainingAccepted.length >= totalPositions && totalPositions > 0) {
        newStatus = 'booked';
      } else if (!hasPendingForPosition) {
        newStatus = 'Needs replacement';
      } else if (hasReplacement) {
        newStatus = 'Needs replacement';
      } else if (hasOtherAccepted) {
        newStatus = 'Partially staffed';
      } else if (hasPending) {
        newStatus = 'Offer awaiting response';
      }

      let updatedOffersArray = existingData.offers;
      if (Array.isArray(updatedOffersArray)) {
        updatedOffersArray = updatedOffersArray.map((o: any) =>
          o.id === offerId ? { ...o, status: 'declined', state: 'declined' } : o
        );
      }

      await tx.update(requests)
        .set({
          status: newStatus,
          data: {
            ...existingData,
            ...(updatedOffersArray ? { offers: updatedOffersArray } : {})
            // existingData is a loose record, so the spread loses the typed `brief` / `intake` keys.
          } as unknown as RequestData,
          updatedAt: now
        })
        .where(eq(requests.id, offer.requestId));
    }
    return { ok: true, offer: updatedOffer, posIdx };
  });

  if (!outcome.ok) {
    revalidatePath('/jobs');
    revalidatePath('/interpreter-home');
    return { success: false, error: outcome.error };
  }
  const { offer: updatedOffer, posIdx } = outcome;

  // Agency: in-app notification + email, with the job's reference, date and location.
  await alertAgency({
    event: normResponse === 'accepted' ? 'offer_accepted' : 'offer_declined',
    requestId: offer.requestId,
    interpreterId: offer.interpreterId,
    positionNumber: posIdx,
  });
  await logActivity({
    requestId: offer.requestId,
    interpreterId: offer.interpreterId,
    // The interpreter sees their own booking in the shared history; a decline stays staff-only.
    audience: normResponse === 'accepted' ? 'shared' : 'agency',
    kind: normResponse === 'accepted' ? 'offer_accepted' : 'offer_declined',
    message: normResponse === 'accepted' ? `Offer accepted · booked for Position ${posIdx}` : `Offer declined (Position ${posIdx})`,
    actorLabel: 'Interpreter (in app)',
  });
  // Booked: send the confirmation with the secure full-details link (same email as the magic-link path).
  if (normResponse === 'accepted') {
    await sendBookingConfirmation({ requestId: offer.requestId, interpreterId: offer.interpreterId, positionNumber: posIdx });
  }

  revalidatePath('/interpreter-home');
  revalidatePath('/jobs');
  revalidatePath(`/requests/${offer.requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  return { success: true, offer: updatedOffer };
}

export const td_respond_offer = respondToOffer;
