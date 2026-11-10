"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { staffingFacts, statusAfterWithdraw } from "@/lib/staffing";
import { respondToOffer } from "./respondToOffer";

export async function updateOfferStatus(offerId: string, status: 'accepted' | 'declined' | 'withdrawn') {
  if (status !== 'accepted' && status !== 'declined') await requireRole("agency");
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
    const allReqOffers = await db.select().from(offers).where(eq(offers.requestId, offer.requestId));
    const newStatus = statusAfterWithdraw(staffingFacts(existingData, allReqOffers, { now: new Date(), excludeOfferId: offer.id }));

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
