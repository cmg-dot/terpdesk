"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { readPermission } from "@/lib/agencyPermissions";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { ensureAvailabilityTables } from "./availability";

const AUTO_BOOK_NOT_ALLOWED = "This interpreter has not enabled auto-booking for your agency. You must send an offer instead.";

export async function assignInterpreter(
  requestId: string, 
  interpreterId: string, 
  interpreterName?: string,
  positionIndex: 1 | 2 = 1
) {
  await requireRole("agency");

  // Assigning directly (no offer, no acceptance) is only allowed for interpreters who opted in for this agency.
  // Ordinary offers go through createOffer and never reach this check.
  await ensureAvailabilityTables();
  const permission = await readPermission(DEFAULT_AGENCY_ID, interpreterId);
  if (!permission.allowsAutoBook) return { error: AUTO_BOOK_NOT_ALLOWED };
  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request) throw new Error("Request not found");

  const existingData = (request.data as any) || {};
  const existingOfferPositions = existingData.offerPositions || {};

  // 1. Withdraw offers specifically for this positionIndex on this request
  const allReqOffers = await db.select().from(offers).where(eq(offers.requestId, requestId));
  for (const off of allReqOffers) {
    const offPos = existingOfferPositions[off.id] || 1;
    if (offPos === positionIndex && (off.status === 'pending' || off.status === 'accepted')) {
      await db.update(offers)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(offers.id, off.id));
    }
  }

  // 2. Insert new accepted offer
  const [newOffer] = await db.insert(offers).values({
    requestId,
    interpreterId,
    status: 'accepted',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }).returning();

  const updatedOfferPositions = {
    ...existingOfferPositions,
    [newOffer.id]: positionIndex
  };

  const updatedSlotReplacements = {
    ...(existingData.slotReplacements || {}),
    [positionIndex]: false
  };

  const totalPositions = (existingData.slotCount === 2 || existingData.details?.slotCount === 2 || existingData.positions === "Team — two independent positions" || existingData.requiredPositions === 2) ? 2 : 1;
  const otherPos = positionIndex === 1 ? 2 : 1;

  // Check if other position is booked
  const otherPosBooked = totalPositions === 2 && allReqOffers.some(o => {
    const pos = updatedOfferPositions[o.id] || 1;
    return pos === otherPos && o.status === 'accepted';
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

  const updatedSlots = [
    {
      id: positionIndex === 1 ? newOffer.id : (existingData.slots?.[0]?.id || 'slot-1'),
      positionIndex: 1,
      active: true,
      reservedBy: positionIndex === 1 ? interpreterId : (existingData.slots?.[0]?.reservedBy || null),
      interpreterName: positionIndex === 1 ? (interpreterName || 'Assigned') : (existingData.slots?.[0]?.interpreterName || undefined),
      needsReplacement: positionIndex === 1 ? false : Boolean(updatedSlotReplacements[1]),
      followUp: false
    },
    ...(totalPositions === 2 ? [{
      id: positionIndex === 2 ? newOffer.id : (existingData.slots?.[1]?.id || 'slot-2'),
      positionIndex: 2,
      active: true,
      reservedBy: positionIndex === 2 ? interpreterId : (existingData.slots?.[1]?.reservedBy || null),
      interpreterName: positionIndex === 2 ? (interpreterName || 'Assigned') : (existingData.slots?.[1]?.interpreterName || undefined),
      needsReplacement: positionIndex === 2 ? false : Boolean(updatedSlotReplacements[2]),
      followUp: false
    }] : [])
  ];

  // 3. Update request row
  const [updated] = await db.update(requests)
    .set({ 
      status: newStatus,
      data: {
        ...existingData,
        offerPositions: updatedOfferPositions,
        slotReplacements: updatedSlotReplacements,
        slots: updatedSlots,
        assignedInterpreterName: positionIndex === 1 ? (interpreterName || 'Assigned') : (existingData.assignedInterpreterName || interpreterName)
      },
      updatedAt: new Date() 
    })
    .where(eq(requests.id, requestId))
    .returning();

  // Assigned without an Accept click, so send the same booking confirmation (with the secure full-details link) the
  // interpreter would have received by accepting. It never throws: a failed email can't undo the assignment.
  await sendBookingConfirmation({ requestId, interpreterId, positionNumber: positionIndex });

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');

  return { request: updated, offer: { ...newOffer, positionIndex } };
}
