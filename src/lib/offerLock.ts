import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The edit lock for a request, enforced on the server so it cannot be bypassed from the browser.
 *
 * LOCKED while any offer is live (pending and not past its deadline, before the appointment ends): the interpreter is
 * deciding on the details they were sent, so those details must not move under them.
 * LOCKED once a booked appointment has started (in progress or over): hours are reported against it.
 * UNLOCKED otherwise, including when an interpreter is booked for a future appointment. Saving such an edit notifies
 * the booked interpreter of exactly what changed (see jobUpdateNotice.ts).
 *
 * SERVER ONLY: queries the database.
 */

export const OFFERS_PENDING_MESSAGE =
  "This request can't be edited while an offer is waiting for a response. Once every pending offer has been accepted, declined or has expired, you can edit it.";
export const BOOKING_STARTED_MESSAGE =
  "This appointment has already started, so its booked details can no longer be edited.";

const BOOKED_STATUSES = ["assigned", "booked", "Fully staffed"];

export type EditLock = { locked: false } | { locked: true; message: string };

export async function getRequestEditLock(requestId: string, now: Date = new Date()): Promise<EditLock> {
  const [request] = await db
    .select({ status: requests.status, createdAt: requests.createdAt, data: requests.data })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request) return { locked: false };

  let startMs = Number.NaN;
  let endMs = Number.NaN;
  try {
    const times = resolveRequestTimes(request);
    startMs = new Date(times.startsAt).getTime();
    endMs = new Date(times.endsAt).getTime();
  } catch {
    // Unknown times: only the pending-offer rule can apply.
  }
  const appointmentEnded = !Number.isNaN(endMs) && now.getTime() > endMs;
  const appointmentStarted = !Number.isNaN(startMs) && now.getTime() >= startMs;

  const requestOffers = await db
    .select({ status: offers.status, expiresAt: offers.expiresAt })
    .from(offers)
    .where(eq(offers.requestId, requestId));

  const hasLivePending = requestOffers.some(
    (o) => o.status === "pending" && !appointmentEnded && o.expiresAt.getTime() > now.getTime(),
  );
  if (hasLivePending) return { locked: true, message: OFFERS_PENDING_MESSAGE };

  const isBooked = BOOKED_STATUSES.includes(request.status) || requestOffers.some((o) => o.status === "accepted");
  if (isBooked && appointmentStarted) return { locked: true, message: BOOKING_STARTED_MESSAGE };

  return { locked: false };
}
