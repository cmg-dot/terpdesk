"use server";

import { requireInterpreter, FORBIDDEN } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolveRequestTimes } from "@/utils/timezone";
import { td_conflict } from "./availability";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { notifyAgencyAdmins } from "@/lib/notifications";
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

  // 5. Update offer
  const updatedOffers = await db.update(offers)
    .set({ status: normResponse, updatedAt: now })
    .where(eq(offers.id, offerId))
    .returning();

  const updatedOffer = updatedOffers[0];
  const existingData = (parentReq.data as any) || {};
  const offerPositions = existingData.offerPositions || {};
  const posIdx = (offerPositions[offerId] || 1) as 1 | 2;
  const totalPositions = (existingData.slotCount === 2 || existingData.details?.slotCount === 2 || existingData.positions === "Team — two independent positions" || existingData.requiredPositions === 2) ? 2 : 1;
  const otherPos = posIdx === 1 ? 2 : 1;

  const allReqOffers = await db.select().from(offers).where(eq(offers.requestId, offer.requestId));

  if (normResponse === 'accepted') {
    // Withdraw any other pending offers for THIS specific position
    for (const off of allReqOffers) {
      if (off.id !== updatedOffer.id && (offerPositions[off.id] || 1) === posIdx && off.status === 'pending') {
        await db.update(offers)
          .set({ status: 'withdrawn', updatedAt: now })
          .where(eq(offers.id, off.id));
      }
    }

    const updatedSlotReplacements = {
      ...(existingData.slotReplacements || {}),
      [posIdx]: false
    };

    const otherPosBooked = totalPositions === 2 && allReqOffers.some(o => {
      const p = offerPositions[o.id] || 1;
      return o.id !== updatedOffer.id && p === otherPos && o.status === 'accepted';
    });

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

    await db.update(requests)
      .set({ 
        status: newStatus,
        data: {
          ...existingData,
          slotReplacements: updatedSlotReplacements,
          ...(updatedOffersArray ? { offers: updatedOffersArray } : {})
        },
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
      o => o.id !== updatedOffer.id && o.status === 'pending' && new Date(o.expiresAt) > now && (offerPositions[o.id] || 1) === posIdx
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

    await db.update(requests)
      .set({ 
        status: newStatus,
        data: {
          ...existingData,
          ...(updatedOffersArray ? { offers: updatedOffersArray } : {})
        },
        updatedAt: now 
      })
      .where(eq(requests.id, offer.requestId));
  }

  const who_name = (await getInterpreterDisplayName(offer.interpreterId)) ?? "An interpreter";
  await notifyAgencyAdmins({
    type: "job",
    href: `/requests/${offer.requestId}`,
    title: normResponse === 'accepted' ? "Offer accepted" : "Offer declined",
    message: `${who_name} ${normResponse === 'accepted' ? "accepted the job" : "declined the offer"}.`,
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
