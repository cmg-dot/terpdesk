"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { resolveRequestTimes } from "@/utils/timezone";
import { notifyInterpreter } from "@/lib/notifications";
import { logActivity } from "@/lib/requestActivity";
import { logError } from "@/lib/logError";
import { offerBlock } from "@/lib/offerAvailability";
import { checkInterpreterFit } from "./availability";
import type { InterpreterFitStatus } from "./availability";

interface CreateOfferPayload {
  requestId: string;
  interpreterId: string;
  expiresAt: Date;
  positionIndex?: 1 | 2;
}

type OfferRecord = typeof offers.$inferSelect;

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type CreateOfferResult = { success: true; offer: OfferRecord & { positionIndex: 1 | 2 } } | { success: false; error: string };

/** The appointment's own time zone, used only when the interpreter has no profile zone of their own. */
const jobTimeZoneOf = (data: unknown): string | undefined => {
  const d = data as { details?: { timeZone?: unknown }; timeZone?: unknown } | null;
  const zone = d?.details?.timeZone ?? d?.timeZone;
  return typeof zone === "string" ? zone : undefined;
};

// Not exported: a "use server" file may only export async functions (types are fine).
const PAST_APPOINTMENT_MESSAGE =
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

  // Standard offers respect availability (the Directly assign override does not). Checked here, not just in the form,
  // so a stale page or a hand-made request can't send one. If the check itself fails, nothing is sent.
  let fit: InterpreterFitStatus;
  try {
    ({ fit } = await checkInterpreterFit({
      interpreterId: payload.interpreterId,
      jobStartsAtUtc: apptStart,
      jobEndsAtUtc: apptEnd,
      jobTimeZone: jobTimeZoneOf(request.data),
    }));
  } catch (err) {
    logError("createOffer availability check", err);
    return { success: false, error: "We couldn't check this interpreter's availability, so the offer wasn't sent. Please try again." };
  }
  const block = offerBlock(fit, "This interpreter");
  if (block) return { success: false, error: block.message };

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

  await logActivity({ requestId: payload.requestId, interpreterId: payload.interpreterId, kind: "offer_sent", message: `Offer sent (Position ${positionIndex})` });

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
