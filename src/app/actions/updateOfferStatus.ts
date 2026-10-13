"use server";

import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { respondToOffer } from "./respondToOffer";

export async function updateOfferStatus(offerId: string, status: 'accepted' | 'declined' | 'withdrawn') {
  if (status === 'accepted' || status === 'declined') {
    return await respondToOffer(offerId, status);
  }

  // Update offer to withdrawn
  const updatedOffers = await db.update(offers)
    .set({ status, updatedAt: new Date() })
    .where(eq(offers.id, offerId))
    .returning();

  if (!updatedOffers.length) {
    throw new Error("Offer not found");
  }

  const offer = updatedOffers[0];
  const [parentReq] = await db.select().from(requests).where(eq(requests.id, offer.requestId));

  if (parentReq) {
    const existingData = (parentReq.data as any) || {};
    const totalPositions = (existingData.slotCount === 2 || existingData.details?.slotCount === 2 || existingData.positions === "Team — two independent positions" || existingData.requiredPositions === 2) ? 2 : 1;

    const allReqOffers = await db.select().from(offers).where(eq(offers.requestId, offer.requestId));

    const remainingAccepted = allReqOffers.filter(o => o.id !== offer.id && o.status === 'accepted');
    const hasOtherAccepted = remainingAccepted.length > 0;
    const hasPending = allReqOffers.some(o => o.id !== offer.id && o.status === 'pending' && new Date(o.expiresAt) > new Date());
    const hasReplacement = Boolean(existingData.slotReplacements?.[1] || existingData.slotReplacements?.[2]);

    let newStatus = 'Unfilled / draft';
    if (remainingAccepted.length >= totalPositions && totalPositions > 0) {
      newStatus = 'booked';
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
        o.id === offerId ? { ...o, status: 'withdrawn', state: 'withdrawn' } : o
      );
    }

    await db.update(requests)
      .set({ 
        status: newStatus,
        data: {
          ...existingData,
          ...(updatedOffersArray ? { offers: updatedOffersArray } : {})
        },
        updatedAt: new Date() 
      })
      .where(eq(requests.id, offer.requestId));
  }

  revalidatePath('/interpreter-home');
  revalidatePath('/jobs');
  revalidatePath(`/requests/${offer.requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  return offer;
}
