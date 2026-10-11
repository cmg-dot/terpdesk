"use server";

import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

interface CreateOfferPayload {
  requestId: string;
  interpreterId: string;
  expiresAt: Date;
}

export async function createOffer(payload: CreateOfferPayload) {
  const [request] = await db.select().from(requests).where(eq(requests.id, payload.requestId));
  if (!request) throw new Error("Request not found");

  if (payload.expiresAt <= new Date()) {
    throw new Error("Expiry must be in the future");
  }
  
  if (payload.expiresAt >= request.createdAt) {
    throw new Error("Expiry must be before appointment start");
  }
  const [newOffer] = await db.insert(offers).values({
    requestId: payload.requestId,
    interpreterId: payload.interpreterId,
    expiresAt: payload.expiresAt,
    status: 'pending'
  }).returning();

  // Also update request status to 'Offer awaiting response'
  await db.update(requests)
    .set({ status: 'Offer awaiting response', updatedAt: new Date() })
    .where(eq(requests.id, payload.requestId));

  revalidatePath(`/requests/${payload.requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  
  return newOffer;
}
