import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The edit lock for a request, enforced on the server so it cannot be bypassed from the browser.
 *
 * A request is LOCKED while any offer is live (pending and not past its deadline, before the appointment ends) or any
 * interpreter is booked (an accepted offer, or the request is already assigned / booked / fully staffed).
 * It is UNLOCKED again once every offer has expired, been declined or been withdrawn: the agency may then edit the
 * request (time included) and send new offers. This mirrors the request page's own rule, which used to be the only
 * place it was applied.
 *
 * SERVER ONLY: queries the database.
 */

export const EDIT_LOCKED_MESSAGE =
  "This request can't be edited while offers are pending or an interpreter is booked. Once every offer has expired or been declined, you can edit it and send new offers.";

const BOOKED_STATUSES = ["assigned", "booked", "Fully staffed"];

export async function isRequestEditLocked(requestId: string, now: Date = new Date()): Promise<boolean> {
  const [request] = await db
    .select({ status: requests.status, createdAt: requests.createdAt, data: requests.data })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request) return false;
  if (BOOKED_STATUSES.includes(request.status)) return true;

  let appointmentEnded = false;
  try {
    const ends = new Date(resolveRequestTimes(request).endsAt).getTime();
    appointmentEnded = !Number.isNaN(ends) && now.getTime() > ends;
  } catch {
    appointmentEnded = false;
  }

  const requestOffers = await db
    .select({ status: offers.status, expiresAt: offers.expiresAt })
    .from(offers)
    .where(eq(offers.requestId, requestId));

  return requestOffers.some(
    (o) => o.status === "accepted" || (o.status === "pending" && !appointmentEnded && o.expiresAt.getTime() > now.getTime()),
  );
}
