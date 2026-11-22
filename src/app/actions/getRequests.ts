"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveRequestTimes } from "@/utils/timezone";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { mapRequestRow } from "@/lib/mapRequestRow";
import { announceExpiredOffer, claimExpiredOffer, expiryNeedsStaff } from "@/lib/offerExpiryAlert";
import type { ExpiredOffer } from "@/lib/offerExpiryAlert";

/**
 * ONE request in full (its whole data blob and every offer), for that request's own page. There is deliberately no "every request in
 * full" action any more (it was 8+ MB and a public endpoint): lists and counts read the lean rows (getRequestList.ts,
 * getDashboardSummary.ts) and the hours review reads only the requests that hold hours (getHoursReviewData.ts). A maintenance script
 * that really needs every request in full can call loadRequestRows("all") from lib/requestRows.ts.
 */
export async function fetchLiveRequestById(id: string) {
  await requireRole("agency");
  await ensureDisplayNameColumns();
  const dbRows = await db.select().from(requests).where(eq(requests.id, id));
  if (!dbRows || dbRows.length === 0) return null;
  const row = dbRows[0];

  const requestOffers = await db.select({
    id: offers.id,
    requestId: offers.requestId,
    interpreterId: offers.interpreterId,
    interpreterName: interpreterDisplayName,
    state: offers.status,
    status: offers.status,
    expiresAt: offers.expiresAt,
    // When the offer last changed (sent, accepted, declined, expired): tells which answer is the latest.
    updatedAt: offers.updatedAt,
    // The interpreter's answers when accepting (Staffing's callout), as the list loader (requestRows.ts) reads them.
    travelRequested: offers.travelRequested,
    travelMinutes: offers.travelMinutes,
    availabilityNote: offers.availabilityNote,
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id))
  .where(eq(offers.requestId, id));

  const now = new Date();
  const { endsAt } = resolveRequestTimes(row);
  const endsAtDate = new Date(endsAt);
  const isAppointmentPassed = !isNaN(endsAtDate.getTime()) && now > endsAtDate;

  // Auto-expire pending offers if the appointment passed or the offer's response deadline passed
  let anyExpired = false;
  const toAnnounce: ExpiredOffer[] = [];
  const { startsAt: appointmentStartsAt } = resolveRequestTimes(row);
  for (const o of requestOffers) {
    const deadlinePassed = Boolean(o.expiresAt) && new Date(o.expiresAt).getTime() <= now.getTime();
    if ((o.status === 'pending' || o.state === 'pending') && (isAppointmentPassed || deadlinePassed)) {
      // Conditional: only the caller that really changes the offer announces it (offerExpiry.ts).
      const claimed = await claimExpiredOffer(o.id, now);
      if (claimed && expiryNeedsStaff(now, { expiresAt: o.expiresAt, startsAt: appointmentStartsAt })) {
        toAnnounce.push({ offerId: o.id, requestId: o.requestId, interpreterId: o.interpreterId, data: row.data });
      }
      o.status = 'expired';
      o.state = 'expired';
      anyExpired = true;
    }
  }

  if (anyExpired) {
    const rowData = (row.data as any) || {};
    let modified = false;
    if (Array.isArray(rowData.offers)) {
      rowData.offers = rowData.offers.map((off: any) => {
        const foundOff = requestOffers.find(ro => ro.id === off.id);
        return foundOff ? { ...off, status: foundOff.status, state: foundOff.state } : off;
      });
      modified = true;
    }

    const hasOtherPending = requestOffers.some(o => o.status === 'pending' || o.state === 'pending');
    const hasAccepted = requestOffers.some(o => o.status === 'accepted' || o.state === 'accepted');

    if (row.status === 'Offer awaiting response' && !hasOtherPending) {
      const newStatus = hasAccepted ? 'Partially staffed' : 'Unfilled / draft';
      await db.update(requests)
        .set({
          status: newStatus,
          data: modified ? rowData : row.data,
          updatedAt: now
        })
        .where(eq(requests.id, row.id));
      row.status = newStatus;
    } else if (modified) {
      await db.update(requests)
        .set({ data: rowData, updatedAt: now })
        .where(eq(requests.id, row.id));
    }
  }
  for (const expired of toAnnounce) await announceExpiredOffer(expired);

  const mappedOffers = requestOffers.map(o => ({
    id: o.id,
    interpreterId: o.interpreterId,
    interpreterName: o.interpreterName || 'Unknown Interpreter',
    state: o.state,
    status: o.status,
    expiresAt: o.expiresAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    travelRequested: o.travelRequested,
    travelMinutes: o.travelMinutes,
    availabilityNote: o.availabilityNote,
  }));

  return mapRequestRow(row, mappedOffers);
}
