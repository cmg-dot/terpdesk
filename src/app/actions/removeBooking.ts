"use server";

import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeBooking(requestId: string, offerId?: string, positionIndex?: 1 | 2) {
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error("Request not found");

  const existingData = (request.data as any) || {};
  const offerPositions = existingData.offerPositions || {};

  // 1. Withdraw specific offer or find accepted offer for this positionIndex
  const isRealOfferId = Boolean(offerId && UUID_PATTERN.test(offerId));
  let targetPos: 1 | 2 = positionIndex || 1;
  if (offerId && isRealOfferId) {
    targetPos = (positionIndex || offerPositions[offerId] || 1) as 1 | 2;
    await db.update(offers)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(eq(offers.id, offerId));
  } else {
    // Synthetic ids (e.g. 'assigned-1') or no id: withdraw every accepted offer for this position
    const allReqOffers = await db.select().from(offers).where(and(eq(offers.requestId, requestId), eq(offers.status, 'accepted')));
    const matches = allReqOffers.filter(o => (offerPositions[o.id] || 1) === targetPos);
    const toWithdraw = matches.length > 0 ? matches : (positionIndex ? [] : allReqOffers.slice(0, 1));
    for (const match of toWithdraw) {
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
      ? { ...s, reservedBy: null, assignedInterpreterId: null, interpreterName: undefined, needsReplacement: true } 
      : s
  );

  // Clear every assigned-interpreter field the UI/getRequests derives "Filled" from
  const clearedAssignment: Record<string, any> = {};
  if (targetPos === 1) {
    clearedAssignment.assignedInterpreterId = null;
    clearedAssignment.assignedInterpreterName = null;
  } else {
    clearedAssignment.position2InterpreterId = null;
    clearedAssignment.position2InterpreterName = null;
  }

  const newStatus = 'Needs replacement';

  // 3. Transition request status to 'Needs replacement'
  const [updated] = await db.update(requests)
    .set({ 
      status: newStatus,
      data: {
        ...existingData,
        ...clearedAssignment,
        slotReplacements: updatedSlotReplacements,
        ...(updatedSlots ? { slots: updatedSlots } : {}),
        ...(existingData.overview ? { overview: { ...existingData.overview, status: newStatus } } : {})
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
