"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { resolveRequestTimes } from "@/utils/timezone";
import { notifyInterpreter } from "@/lib/notifications";

interface CreateOfferPayload {
  requestId: string;
  interpreterId: string;
  expiresAt: Date;
  positionIndex?: 1 | 2;
}

export async function createOffer(payload: CreateOfferPayload) {
  await requireRole("agency");
  const [request] = await db.select().from(requests).where(eq(requests.id, payload.requestId));
  if (!request) throw new Error("Request not found");

  if (payload.expiresAt <= new Date()) {
    throw new Error("Expiry must be in the future");
  }
  
  const { startsAt } = resolveRequestTimes(request);
  const apptStart = new Date(startsAt);
  if (!isNaN(apptStart.getTime()) && payload.expiresAt >= apptStart) {
    throw new Error("Expiry must be before appointment start");
  }
  const [newOffer] = await db.insert(offers).values({
    requestId: payload.requestId,
    interpreterId: payload.interpreterId,
    expiresAt: payload.expiresAt,
    status: 'pending'
  }).returning();

  const positionIndex = payload.positionIndex || 1;
  const existingData = (request.data as any) || {};
  const updatedOfferPositions = {
    ...(existingData.offerPositions || {}),
    [newOffer.id]: positionIndex
  };

  // Update request status and offerPositions
  const newStatus = (request.status === 'booked' || request.status === 'Fully staffed') 
    ? request.status 
    : 'Offer awaiting response';

  await db.update(requests)
    .set({ 
      status: newStatus,
      data: {
        ...existingData,
        offerPositions: updatedOfferPositions
      },
      updatedAt: new Date() 
    })
    .where(eq(requests.id, payload.requestId));

  await notifyInterpreter(payload.interpreterId, {
    type: "job",
    href: "/jobs",
    title: "New job offer",
    message: "You have a new job offer from your agency. Open it to review and respond.",
  });

  revalidatePath(`/requests/${payload.requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  
  return { ...newOffer, positionIndex };
}
