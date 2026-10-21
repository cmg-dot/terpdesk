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

type OfferRecord = typeof offers.$inferSelect;

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type CreateOfferResult = { success: true; offer: OfferRecord & { positionIndex: 1 | 2 } } | { success: false; error: string };

export const PAST_APPOINTMENT_MESSAGE =
  "This appointment's scheduled time has already started or passed, so new offers can't be sent. Edit the time to a future date to offer it again.";

export async function createOffer(payload: CreateOfferPayload): Promise<CreateOfferResult> {
  await requireRole("agency");
  const [request] = await db.select().from(requests).where(eq(requests.id, payload.requestId));
  if (!request) return { success: false, error: "This request no longer exists." };

  const status = String(request.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled") return { success: false, error: "This appointment was cancelled." };

  const now = new Date();
  const { startsAt, endsAt } = resolveRequestTimes(request);
  const apptStart = new Date(startsAt);
  const apptEnd = new Date(endsAt);
  // Past (or already under way) jobs can't be offered: the time has to be edited to the future first.
  if ((!isNaN(apptEnd.getTime()) && apptEnd <= now) || (!isNaN(apptStart.getTime()) && apptStart <= now)) {
    return { success: false, error: PAST_APPOINTMENT_MESSAGE };
  }

  if (payload.expiresAt <= now) {
    return { success: false, error: "The response deadline must be in the future." };
  }
  if (!isNaN(apptStart.getTime()) && payload.expiresAt >= apptStart) {
    return { success: false, error: "The response deadline must be before the appointment starts." };
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

  return { success: true, offer: { ...newOffer, positionIndex } };
}
