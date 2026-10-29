"use server";

import { requireInterpreter } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveRequestTimes } from "@/utils/timezone";
import { isStateJobRequest } from "@/lib/stateJob";
import { interpreterSafeData, interpreterSafeDetails } from "@/lib/interpreterJobData";
import { latestSheetsByRequest, resolveOwnHours } from "@/lib/ownHours";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";

// The email argument is ignored: only the signed-in interpreter's own offers are ever returned.
export async function fetchInterpreterOffers(_interpreterEmail?: string) {
  const { interpreterId } = await requireInterpreter();
  const interpreterRows = await db.select().from(interpreters).where(eq(interpreters.id, interpreterId));
  if (!interpreterRows.length) return [];
  const interpreter = interpreterRows[0];

  // Join offers with requests
  const offersData = await db.select({
    offer: offers,
    request: requests,
  })
  .from(offers)
  .innerJoin(requests, eq(offers.requestId, requests.id))
  .where(eq(offers.interpreterId, interpreter.id));

  const now = new Date();

  // Inspect pending offers and auto-expire those whose appointment has passed
  for (const row of offersData) {
    if (row.offer.status === 'pending') {
      const { endsAt } = resolveRequestTimes(row.request);
      const endsAtDate = new Date(endsAt);
      if (!isNaN(endsAtDate.getTime()) && now > endsAtDate) {
        // Expire offer in PostgreSQL offers table
        await db.update(offers)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(offers.id, row.offer.id));
        row.offer.status = 'expired';

        // Sync cached offers inside requests.data if present
        const rowData = (row.request.data as any) || {};
        let modifiedData = false;
        if (Array.isArray(rowData.offers)) {
          rowData.offers = rowData.offers.map((o: any) =>
            o.id === row.offer.id ? { ...o, status: 'expired', state: 'expired', expiredAt: now.toISOString() } : o
          );
          modifiedData = true;
        }

        // Update parent request status if it was awaiting response and has no other pending offers
        const allOffersForReq = await db.select().from(offers).where(eq(offers.requestId, row.request.id));
        const hasOtherLivePending = allOffersForReq.some(o => o.id !== row.offer.id && o.status === 'pending');
        const hasAccepted = allOffersForReq.some(o => o.status === 'accepted');

        if (row.request.status === 'Offer awaiting response' && !hasOtherLivePending) {
          const newReqStatus = hasAccepted ? 'Partially staffed' : 'Unfilled / draft';
          await db.update(requests)
            .set({
              status: newReqStatus,
              data: modifiedData ? rowData : row.request.data,
              updatedAt: now
            })
            .where(eq(requests.id, row.request.id));
          row.request.status = newReqStatus;
        } else if (modifiedData) {
          await db.update(requests)
            .set({ data: rowData, updatedAt: now })
            .where(eq(requests.id, row.request.id));
        }
      }
    }
  }

  // Magic-link timesheets this interpreter submitted (also covers ones sent before they were mirrored into the request).
  const sheetByRequest = await latestSheetsByRequest(interpreter.id);

  return offersData.map(row => {
    const rowData = (row.request.data as any) || {};
    const details = rowData.details || {};
    const onsite = rowData.onsite || {};

    const { startsAt, endsAt } = resolveRequestTimes(row.request);

    const rawSetting = rowData.setting || details.setting;
    const setting = rawSetting && rawSetting !== "Choose a setting" ? rawSetting : "Medical";

    const format = details.format || rowData.format || (onsite.venue && !onsite.venue.toLowerCase().includes('virtual') ? "In person" : "Virtual");
    const isVirtual = format.toLowerCase().includes('virtual');

    const meetingLink = details.meetingLink || details.virtualLink || rowData.meetingLink || rowData.virtualLink || null;
    const meetingId = details.meetingId || rowData.meetingId || null;
    const passcode = details.passcode || details.accessCode || rowData.passcode || rowData.accessCode || null;
    const platform = details.platform || rowData.platform || (meetingLink?.includes('zoom') ? 'Zoom' : meetingLink?.includes('teams') ? 'Microsoft Teams' : meetingLink?.includes('meet.google') ? 'Google Meet' : 'Virtual');
    const virtualInstructions = details.virtualInstructions || details.instructions || rowData.virtualInstructions || null;

    const location = rowData.location || (
      isVirtual
        ? (platform ? `${platform} (Virtual)` : "Virtual")
        : (onsite.venue ? (onsite.address ? `${onsite.venue} · ${onsite.address}` : onsite.venue) : (onsite.address || "Location pending"))
    );

    // A cancelled appointment closes its offers (see cancelRequest). This also covers older cancellations that left the
    // offer 'accepted', so a cancelled job is never shown to the interpreter as Booked or Happening now.
    const requestCancelled = Boolean(row.request.canceledAt) || /^cancel+ed$/i.test(row.request.status);
    const effectiveOfferStatus =
      requestCancelled && row.offer.status === 'accepted' ? 'cancelled'
      : requestCancelled && row.offer.status === 'pending' ? 'withdrawn'
      : row.offer.status;
    // Only the viewer's OWN hours (see resolveOwnHours), with their magic-link timesheet layered on.
    const sheet = row.offer.status === 'accepted' ? sheetByRequest.get(row.request.id) : undefined;
    const { posIdx, isTeamJob, hoursSub } = resolveOwnHours({ rowData, offerId: row.offer.id, interpreterId: interpreter.id, sheet });

    // Set by a post-booking edit for the offers that were booked at the time (see jobUpdateNotice.ts).
    const update = rowData.detailsUpdate as { at?: unknown; fields?: unknown; offerIds?: unknown } | undefined;
    const detailsUpdated =
      row.offer.status === 'accepted' && Array.isArray(update?.offerIds) && update.offerIds.includes(row.offer.id) && typeof update.at === 'string'
        ? { at: update.at, fields: Array.isArray(update.fields) ? update.fields.filter((f): f is string => typeof f === 'string') : [] }
        : null;

    return {
      id: row.offer.id,
      requestId: row.request.id,
      positionIndex: posIdx,
      detailsUpdated,
      title: row.request.title,
      startsAt,
      endsAt,
      status: effectiveOfferStatus,
      expiredAt: row.offer.status === 'expired' ? (row.offer.updatedAt ? row.offer.updatedAt.toISOString() : endsAt) : null,
      requestStatus: row.request.status,
      // Team jobs: request-wide status/travel describe both positions, so the UI must not use them for this
      // interpreter's hours (see scopedRequestStatus).
      isTeamJob,
      agencyName: DEFAULT_AGENCY_NAME,
      interpreterId: row.offer.interpreterId,
      program: rowData?.intake?.program || "General",
      isStateJob: isStateJobRequest(row.request),
      timeZone: details.timeZone || "America/Los_Angeles",
      hoursSubmission: hoursSub,
      // Request-level columns are a single-position legacy field; never shown on a team job (each position's own
      // values are in hoursSubmission).
      travelStartTime: !isTeamJob && row.request.travelStartTime ? row.request.travelStartTime.toISOString() : null,
      travelEndTime: !isTeamJob && row.request.travelEndTime ? row.request.travelEndTime.toISOString() : null,
      serviceCompleted: isTeamJob ? null : row.request.serviceCompleted,
      setting,
      format,
      isVirtual,
      location,
      meetingLink,
      virtualLink: meetingLink,
      meetingId,
      passcode,
      accessCode: passcode,
      platform,
      virtualInstructions,
      details: {
        ...interpreterSafeDetails(details),
        setting,
        format,
        timeZone: details.timeZone || "America/Los_Angeles",
        meetingLink,
        virtualLink: meetingLink,
        meetingId,
        passcode,
        accessCode: passcode,
        platform,
        virtualInstructions,
      },
      onsite: {
        venue: onsite.venue || (isVirtual ? "Virtual" : "Location pending"),
        address: onsite.address || "",
        building: onsite.building || "",
        parking: onsite.parking || "",
        entrance: onsite.entrance || "",
        contact: onsite.contact || "",
        contactMethod: onsite.contactMethod || "",
      },
      // Staff-only keys (private notes, the raw email, requester, other interpreters' data) never reach the browser.
      data: interpreterSafeData(rowData)
    };
  });
}
