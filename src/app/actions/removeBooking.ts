"use server";

import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function removeBooking(requestId: string, offerId?: string, positionIndex?: 1 | 2) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error("Request not found");

  const existingData = (request.data as any) || {};
  const offerPositions = existingData.offerPositions || {};

  // 1. Withdraw specific offer or find accepted offer for this positionIndex
  let targetPos: 1 | 2 = positionIndex || 1;
  if (offerId) {
    targetPos = (positionIndex || offerPositions[offerId] || 1) as 1 | 2;
    await db.update(offers)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(eq(offers.id, offerId));
  } else {
    const allReqOffers = await db.select().from(offers).where(and(eq(offers.requestId, requestId), eq(offers.status, 'accepted')));
    const match = allReqOffers.find(o => (offerPositions[o.id] || 1) === targetPos) || allReqOffers[0];
    if (match) {
      await db.update(offers)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(offers.id, match.id));
    }
  }

  // 2. Mark this specific position as Needs replacement in requests.data
  const updatedSlotReplacements = {
    ...(existingData.slotReplacements || {}),
    [targetPos]: true
  };

  const updatedSlots = existingData.slots?.map((s: any) => 
    s.positionIndex === targetPos 
      ? { ...s, reservedBy: null, interpreterName: undefined, needsReplacement: true } 
      : s
  );

  // 3. Transition request status to 'Needs replacement'
  const [updated] = await db.update(requests)
    .set({ 
      status: 'Needs replacement',
      data: {
        ...existingData,
        slotReplacements: updatedSlotReplacements,
        ...(updatedSlots ? { slots: updatedSlots } : {})
      },
      updatedAt: new Date() 
    })
    .where(eq(requests.id, requestId))
    .returning();

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');

  return updated;
}
