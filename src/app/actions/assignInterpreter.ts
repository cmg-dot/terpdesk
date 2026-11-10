"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { readPermission } from "@/lib/agencyPermissions";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { logActivity } from "@/lib/requestActivity";
import { ensureAvailabilityTables } from "./availability";
import { interpreterHoldsOtherPosition, lockRequestForPosition, OTHER_POSITION_MESSAGE } from "@/lib/positionClaim";
import { isActivePosition, positionLabel, positionOfOffer, readPositions } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";
import { assignmentFields, rebuildSlots, staffingFacts, statusAfterBooking } from "@/lib/staffing";

const AUTO_BOOK_NOT_ALLOWED = "This interpreter has not enabled auto-booking for your agency. You must send an offer instead.";

export async function assignInterpreter(
  requestId: string, 
  interpreterId: string, 
  interpreterName?: string,
  positionIndex: PositionId = 1
) {
  await requireRole("agency");

  // Assigning directly (no offer, no acceptance) is only allowed for interpreters who opted in for this agency.
  // Ordinary offers go through createOffer and never reach this check.
  await ensureAvailabilityTables();
  const permission = await readPermission(DEFAULT_AGENCY_ID, interpreterId);
  if (!permission.allowsAutoBook) return { error: AUTO_BOOK_NOT_ALLOWED };
  // One locked transaction (see positionClaim.ts): the assignment only touches its own position and is written from
  // the fresh row, so an interpreter accepting the other position at the same moment is never overwritten.
  const assigned = await db.transaction(async (tx) => {
  const locked = await lockRequestForPosition(tx, requestId);
  if (!locked) throw new Error("Request not found");

  const existingData = locked.data as Record<string, any>;
  const existingOfferPositions = existingData.offerPositions || {};
  if (!isActivePosition(existingData, positionIndex)) return { error: "This job has no such position." } as const;

  // 1. Withdraw offers specifically for this positionIndex on this request
  const allReqOffers = await tx.select().from(offers).where(eq(offers.requestId, requestId));
  // The same interpreter can't hold two positions of the same job.
  if (await interpreterHoldsOtherPosition(tx, requestId, locked, positionIndex, interpreterId)) {
    return { error: OTHER_POSITION_MESSAGE } as const;
  }
  for (const off of allReqOffers) {
    const offPos = positionOfOffer(existingOfferPositions, off.id);
    if (offPos === positionIndex && (off.status === 'pending' || off.status === 'accepted')) {
      await tx.update(offers)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(offers.id, off.id));
    }
  }

  // 2. Insert new accepted offer
  const [newOffer] = await tx.insert(offers).values({
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

  // The job's other bookings, as they stand (the offers withdrawn above no longer count).
  const stillOpen = allReqOffers.filter((o) => !(positionOfOffer(existingOfferPositions, o.id) === positionIndex && (o.status === 'pending' || o.status === 'accepted')));
  const facts = staffingFacts({ ...existingData, offerPositions: updatedOfferPositions, slotReplacements: updatedSlotReplacements }, stillOpen, { now: new Date() });
  const newStatus = statusAfterBooking(facts, positionIndex);

  const updatedSlots = rebuildSlots({
    ids: readPositions(existingData).ids,
    existing: existingData.slots,
    replacements: updatedSlotReplacements,
    booking: { position: positionIndex, offerId: newOffer.id, interpreterId, interpreterName: interpreterName || 'Assigned' },
  });

  // 3. Update request row
  const [updated] = await tx.update(requests)
    .set({ 
      status: newStatus,
      data: {
        ...existingData,
        offerPositions: updatedOfferPositions,
        slotReplacements: updatedSlotReplacements,
        slots: updatedSlots,
        // Positions 1 and 2 have their own name fields; later positions keep theirs in the slot record.
        ...assignmentFields(positionIndex, interpreterId, interpreterName || 'Assigned'),
        // existingData is a loose record, so the spread loses the typed `brief` / `intake` keys.
      } as unknown as RequestData,
      updatedAt: new Date() 
    })
    .where(eq(requests.id, requestId))
    .returning();
  return { request: updated, newOffer, posText: positionLabel(existingData, positionIndex) } as const;
  });
  if ("error" in assigned) return { error: assigned.error };
  const { request: updated, newOffer, posText } = assigned;

  // Assigned without an Accept click, so send the same booking confirmation (with the secure full-details link) the
  // interpreter would have received by accepting. It never throws: a failed email can't undo the assignment.
  await logActivity({ requestId, interpreterId, audience: 'shared', kind: 'assigned', message: `Assigned directly · booked for ${posText}`, actorLabel: 'Agency staff' });
  await sendBookingConfirmation({ requestId, interpreterId, positionNumber: positionIndex });

  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');

  return { request: updated, offer: { ...newOffer, positionIndex } };
}
