"use server";

import { requireInterpreter } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers, interpreters, timesheets } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { resolveRequestTimes } from "@/utils/timezone";
import { isStateJobRequest } from "@/lib/stateJob";
import { isTeamRequestData, legacyPosition1Hours } from "@/utils/hoursState";
import { timesheetToHoursSubmission, type TimesheetForSync } from "@/lib/timesheetSync";

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

  // Magic-link timesheets this interpreter submitted. Newer submissions are mirrored into the request already;
  // this also covers ones sent before that mirror existed, so the app never shows "Submit actual hours" for them.
  const sheetRows: (TimesheetForSync & { requestId: string })[] = await db
    .select({
      id: timesheets.id,
      requestId: timesheets.requestId,
      status: timesheets.status,
      actualStartTime: timesheets.actualStartTime,
      actualEndTime: timesheets.actualEndTime,
      breakMinutes: timesheets.breakMinutes,
      travelStartTime: timesheets.travelStartTime,
      travelEndTime: timesheets.travelEndTime,
      mileage: timesheets.mileage,
      approvedMileage: timesheets.approvedMileage,
      travelLegs: timesheets.travelLegs,
      mileageNote: timesheets.mileageNote,
      serviceNote: timesheets.serviceNote,
      serviceCompleted: timesheets.serviceCompleted,
      cancellationReason: timesheets.cancellationReason,
      submittedAt: timesheets.submittedAt,
    })
    .from(timesheets)
    .where(and(eq(timesheets.interpreterId, interpreter.id), inArray(timesheets.status, ["submitted", "approved"])));
  const sheetByRequest = new Map<string, TimesheetForSync>();
  for (const ts of sheetRows) {
    const prev = sheetByRequest.get(ts.requestId);
    if (!prev || (ts.submittedAt?.getTime() ?? 0) > (prev.submittedAt?.getTime() ?? 0)) sheetByRequest.set(ts.requestId, ts);
  }

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

    const isTeamJob = isTeamRequestData(rowData);
    const knownPosition = rowData.offerPositions?.[row.offer.id];
    const posIdx = (knownPosition || 1) as 1 | 2;
    const slotHours = rowData.hoursSubmissions?.[posIdx] || (posIdx === 1 ? legacyPosition1Hours(rowData) : null);
    // Only the viewer's OWN hours: an entry recorded for another interpreter is never returned. On a team job an
    // entry without an owner is trusted only when this offer's position is known for certain.
    const ownerId = slotHours && typeof slotHours.interpreterId === 'string' ? slotHours.interpreterId : null;
    const storedHours = !slotHours
      ? null
      : ownerId
        ? (ownerId === interpreter.id ? slotHours : null)
        : (!isTeamJob || knownPosition ? slotHours : null);
    const sheet = row.offer.status === 'accepted' ? sheetByRequest.get(row.request.id) : undefined;
    // Used when the request holds no submitted in-app hours, or holds this timesheet's own mirror. A mirror keeps
    // its stored review state (e.g. a correction request); only the timesheet's approval is layered on top.
    const isMirror = Boolean(sheet && storedHours?.timesheetId === sheet.id);
    const fromSheet = sheet && (isMirror || !storedHours?.submittedAt) ? timesheetToHoursSubmission(sheet, posIdx) : null;
    const hoursSub = !fromSheet
      ? storedHours
      : isMirror
        ? { ...fromSheet, ...storedHours, ...(sheet?.status === 'approved' ? { status: 'approved', approvedMileage: fromSheet.approvedMileage } : {}) }
        : { ...(storedHours || {}), ...fromSheet, isDraft: false };

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
      status: row.offer.status,
      expiredAt: row.offer.status === 'expired' ? (row.offer.updatedAt ? row.offer.updatedAt.toISOString() : endsAt) : null,
      requestStatus: row.request.status,
      // Team jobs: request-wide status/travel describe both positions, so the UI must not use them for this
      // interpreter's hours (see scopedRequestStatus).
      isTeamJob,
      agencyName: "North Fictional Interpreting",
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
        ...details,
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
      data: rowData
    };
  });
}
