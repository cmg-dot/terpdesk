/**
 * Which accepted offers count as booked on the interpreter's calendar. Pure.
 *
 * The Calendar page draws the jobs the interpreter's job list calls "booked" or "accepted" (lib/interpreterCalendar.ts bookedAppointments),
 * and that list gets its status from fetchInterpreterOffers: an accepted offer on a cancelled request reads "cancelled", a pending one
 * "withdrawn", any other offer keeps its own status. The feed must show the same jobs the page does, so this is that rule, written once
 * for the server, and tests/calendarFeed/parity.test.ts runs both over the same cases (and checks the action still carries the rule).
 */

export interface RequestLike {
  status: string;
  canceledAt?: Date | null;
}

/** A request that was cancelled (the column, or the status text "cancelled" / "canceled"). */
export const requestIsCancelled = (request: RequestLike): boolean => Boolean(request.canceledAt) || /^cancel+ed$/i.test(request.status);

/** The status the interpreter's job list shows for an offer. */
export const effectiveOfferStatus = (offerStatus: string, cancelled: boolean): string =>
  cancelled && offerStatus === "accepted" ? "cancelled" : cancelled && offerStatus === "pending" ? "withdrawn" : offerStatus;

/** True when the job belongs on the calendar (and so in the feed). Test jobs (a title with "Fictional") are left out, as on the page. */
export function isBookedForCalendar(offerStatus: string, request: RequestLike, title: string): boolean {
  const status = effectiveOfferStatus(offerStatus, requestIsCancelled(request)).toLowerCase();
  return (status === "booked" || status === "accepted") && !title.includes("Fictional");
}
