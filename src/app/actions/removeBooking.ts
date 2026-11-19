"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { announceBookingRemoval } from "@/lib/bookingRemoval";
import type { RemovedBooking } from "@/lib/bookingRemoval";
import { positionIdOf, positionOfOffer } from "@/lib/positions";
import type { PositionId } from "@/lib/positions";
import { clearedAssignmentFields } from "@/lib/staffing";

type Loose = Record<string, unknown>;
const asLoose = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input = z.object({
  requestId: z.string().uuid(),
  // A real offer id, or a synthetic one ("assigned-1") for a booking the page shows without its offer.
  offerId: z.string().max(100).optional(),
  positionIndex: z.number().int().min(1).max(200).optional(),
});

/**
 * "Remove booking": staff take a booked interpreter off one position. The booking is withdrawn and the position needs a
 * replacement. The removed interpreter is told (banner, bell and a details-free email) and the request keeps a history line and an
 * audit row (lib/bookingRemoval.ts). Agency staff only.
 */
export async function removeBooking(requestId: string, offerId?: string, positionIndex?: PositionId) {
  const session = await requireRole("agency");
  const parsed = input.safeParse({ requestId, offerId, positionIndex });
  if (!parsed.success) throw new Error("Invalid request.");
  const [request] = await db.select().from(requests).where(eq(requests.id, parsed.data.requestId));
  if (!request) throw new Error("Request not found");

  const existingData = asLoose(request.data);
  const offerPositions = asLoose(existingData.offerPositions) as Record<string, number>;
  const now = new Date();
  // The bookings this removes: only an ACCEPTED offer means the interpreter was booked (and is told).
  const removed: RemovedBooking[] = [];

  // 1. Withdraw specific offer or find accepted offer for this positionIndex
  const target = parsed.data.offerId;
  const isRealOfferId = Boolean(target && UUID_PATTERN.test(target));
  let targetPos: PositionId = positionIdOf(parsed.data.positionIndex);
  if (target && isRealOfferId) {
    targetPos = parsed.data.positionIndex ? positionIdOf(parsed.data.positionIndex) : positionOfOffer(offerPositions, target);
    const [before] = await db.select({ status: offers.status, interpreterId: offers.interpreterId }).from(offers).where(and(eq(offers.id, target), eq(offers.requestId, requestId)));
    await db.update(offers).set({ status: "withdrawn", updatedAt: now }).where(and(eq(offers.id, target), eq(offers.requestId, requestId)));
    if (before?.status === "accepted") removed.push({ requestId, offerId: target, interpreterId: before.interpreterId, positionNumber: targetPos });
  } else {
    // Synthetic ids (e.g. 'assigned-1') or no id: withdraw every accepted offer for this position
    const allReqOffers = await db.select().from(offers).where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
    const matches = allReqOffers.filter((o) => positionOfOffer(offerPositions, o.id) === targetPos);
    const toWithdraw = matches.length > 0 ? matches : parsed.data.positionIndex ? [] : allReqOffers.slice(0, 1);
    for (const match of toWithdraw) {
      await db.update(offers).set({ status: "withdrawn", updatedAt: now }).where(eq(offers.id, match.id));
      removed.push({ requestId, offerId: match.id, interpreterId: match.interpreterId, positionNumber: positionOfOffer(offerPositions, match.id) });
    }
  }

  // 2. Mark this specific position as Needs replacement in requests.data
  const updatedSlotReplacements = { ...asLoose(existingData.slotReplacements), [targetPos]: true };
  const updatedSlots = Array.isArray(existingData.slots)
    ? existingData.slots.map((slot: unknown) => {
        const s = asLoose(slot);
        return s.positionIndex === targetPos ? { ...s, reservedBy: null, assignedInterpreterId: null, interpreterName: undefined, needsReplacement: true } : slot;
      })
    : undefined;

  // Clear every assigned-interpreter field the UI/getRequests derives "Filled" from
  const clearedAssignment = clearedAssignmentFields(targetPos);
  const newStatus = "Needs replacement";
  const overview = existingData.overview ? { overview: { ...asLoose(existingData.overview), status: newStatus } } : {};

  // 3. Transition request status to 'Needs replacement'
  const [updated] = await db
    .update(requests)
    .set({
      status: newStatus,
      data: { ...existingData, ...clearedAssignment, slotReplacements: updatedSlotReplacements, ...(updatedSlots ? { slots: updatedSlots } : {}), ...overview } as unknown as RequestData,
      updatedAt: now,
    })
    .where(eq(requests.id, requestId))
    .returning();

  // 4. Tell each removed interpreter and record it on the job (never throws).
  await announceBookingRemoval(removed, { userId: session.user.id, email: session.user.email ?? null, name: session.user.name || "Agency staff" });

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");

  return updated;
}
