"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/requestActivity";
import { notifyInterpreter } from "@/lib/notifications";
import { lockRequestForPosition } from "@/lib/positionClaim";

const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
  clientRequested: z.boolean().default(false),
});

/** Offer status given to a booking (accepted offer) when its appointment is cancelled. */
const BOOKING_CANCELLED = "cancelled";
/** Offer status given to an open offer (pending) when its appointment is cancelled: closed, as when staff withdraw it. */
const OFFER_WITHDRAWN = "withdrawn";

/**
 * Cancels an appointment and closes everything attached to it, in ONE transaction:
 *  - the request becomes 'Cancelled' (the first cancellation's time and reason are kept);
 *  - every booked interpreter's offer (accepted) becomes 'cancelled', so the booking disappears from their jobs,
 *    calendar and "happening now";
 *  - every open offer (pending) becomes 'withdrawn', so nobody can still accept it.
 * Running it again on an already-cancelled request is safe and also repairs offers a past cancellation left behind.
 * Afterwards the affected interpreters are notified (no job details) and the agency and interpreter pages refreshed.
 */
export async function cancelRequest(id: string, reason?: string, clientRequested: boolean = false) {
  await requireRole("agency");
  const parsed = cancelSchema.parse({ id, reason, clientRequested });
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // Serialises with accepts, give-backs and edits on the same job, so none can slip in half-way through.
    const locked = await lockRequestForPosition(tx, parsed.id);
    if (!locked) return null;

    const alreadyCancelled = locked.status.toLowerCase() === "cancelled" || locked.status.toLowerCase() === "canceled";
    const [updated] = await tx
      .update(requests)
      .set(
        alreadyCancelled
          ? { updatedAt: now }
          : {
              status: "Cancelled",
              canceledAt: now,
              cancelReason: parsed.reason || null,
              clientRequestedCancellation: parsed.clientRequested,
              updatedAt: now,
            },
      )
      .where(eq(requests.id, parsed.id))
      .returning();

    const live = await tx
      .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status })
      .from(offers)
      .where(and(eq(offers.requestId, parsed.id), inArray(offers.status, ["accepted", "pending"])));

    const bookedIds = live.filter((o) => o.status === "accepted").map((o) => o.id);
    const openIds = live.filter((o) => o.status === "pending").map((o) => o.id);
    if (bookedIds.length > 0) await tx.update(offers).set({ status: BOOKING_CANCELLED, updatedAt: now }).where(inArray(offers.id, bookedIds));
    if (openIds.length > 0) await tx.update(offers).set({ status: OFFER_WITHDRAWN, updatedAt: now }).where(inArray(offers.id, openIds));

    return { updated, alreadyCancelled, live };
  });

  if (!result) return undefined;
  const { updated, alreadyCancelled, live } = result;

  // The reason is internal, so the shared entry never includes it.
  if (!alreadyCancelled) {
    await logActivity({
      requestId: parsed.id,
      audience: "shared",
      kind: "cancelled",
      message: parsed.clientRequested ? "Appointment cancelled (client request)" : "Appointment cancelled",
      actorLabel: "Agency staff",
    });
  }

  // Tell each affected interpreter once. No job details in the text: only that an appointment was cancelled.
  const notified = new Set<string>();
  for (const offer of live) {
    if (notified.has(offer.interpreterId)) continue;
    notified.add(offer.interpreterId);
    const booked = live.some((o) => o.interpreterId === offer.interpreterId && o.status === "accepted");
    await notifyInterpreter(offer.interpreterId, {
      type: "job",
      href: booked ? `/jobs/${offer.id}` : "/jobs",
      title: booked ? "Appointment cancelled" : "Offer withdrawn",
      message: booked
        ? "The agency cancelled an appointment you were booked on. It has been removed from your upcoming jobs."
        : "An offer you received was withdrawn because the appointment was cancelled.",
    });
  }

  // Agency side.
  revalidatePath(`/requests/${parsed.id}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/hours-review");
  // Interpreter side: the jobs list, each job page (/jobs/[id] is keyed by offer, so refresh the whole route), home and calendar.
  revalidatePath("/jobs");
  revalidatePath("/jobs/[id]", "page");
  revalidatePath("/interpreter-home");
  revalidatePath("/interpreter-calendar");

  return updated;
}
