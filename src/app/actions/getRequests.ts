"use server";

import { settingLabel } from "@/lib/settingLabel";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatReference, isCompletedRequest, isNeedsReplacementStatus } from "@/utils/statusEngine";
import { isPlainVoidData, isReturnedData, returnedInPortal } from "@/lib/voidReasons";
import { rawJobZone, resolveRequestTimes } from "@/utils/timezone";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { positionIdOf, positionsLabel, readPositions } from "@/lib/positions";

function mapRequestRow(row: any, requestOffers: any[]) {
  const rowData = (row.data as any) || {};
  const details = rowData.details || {};
  const onsite = rowData.onsite || {};
  const requester = rowData.requester || { org: rowData?.intake?.program || "General" };

  const setting = settingLabel(rowData.setting, details.setting);

  const format = details.format || rowData.format || (onsite.venue && !onsite.venue.toLowerCase().includes('virtual') ? "In person" : "Virtual");
  const meetingLink = details.meetingLink || details.virtualLink || rowData.meetingLink || rowData.virtualLink || null;
  // A meeting link means the job is online, whatever its saved format says.
  const isVirtual = format.toLowerCase().includes('virtual') || Boolean(meetingLink);
  const meetingId = details.meetingId || rowData.meetingId || null;
  const passcode = details.passcode || details.accessCode || rowData.passcode || rowData.accessCode || null;
  const platform = details.platform || rowData.platform || (meetingLink?.includes('zoom') ? 'Zoom' : meetingLink?.includes('teams') ? 'Microsoft Teams' : meetingLink?.includes('meet.google') ? 'Google Meet' : 'Virtual');
  const virtualInstructions = details.virtualInstructions || details.instructions || rowData.virtualInstructions || null;

  const location = rowData.location || (
    isVirtual
      ? (platform ? `${platform} (Virtual)` : "Virtual")
      : (onsite.venue ? (onsite.address ? `${onsite.venue} · ${onsite.address}` : onsite.venue) : (onsite.address || "Location pending"))
  );

  const positionIds = readPositions(rowData).ids;
  const totalPositions = positionIds.length;
  const positions = positionsLabel(totalPositions);

  const { startsAt, endsAt } = resolveRequestTimes(row);
  
  const offerPositions = rowData.offerPositions || {};
  const normalizedOffers = requestOffers.map(o => {
    const posIdx = positionIdOf(offerPositions[o.id] ?? (o as any).positionIndex);
    return {
      ...o,
      positionIndex: posIdx,
      status: o.status || o.state || 'pending',
      state: o.state || o.status || 'pending',
      expiresAt: typeof o.expiresAt === 'string' ? o.expiresAt : (o.expiresAt ? new Date(o.expiresAt).toISOString() : new Date().toISOString())
    };
  });

  const isCancelled = row.status === 'Cancelled' || row.status === 'cancelled';
  const isAcceptedOffer = (o: any): boolean => o.status === 'accepted' || o.state === 'accepted';
  const slotRecords: any[] = Array.isArray(rowData.slots) ? rowData.slots : [];
  const slotRecordFor = (id: number, index: number) => slotRecords.find((x: any) => x?.positionIndex === id) ?? (slotRecords[index]?.positionIndex == null ? slotRecords[index] : undefined);
  // The older per-position name fields only exist for Positions 1 and 2.
  const legacyNameFor = (id: number): string | undefined => (id === 1 ? rowData.assignedInterpreterName : id === 2 ? rowData.position2InterpreterName : undefined) || undefined;
  const isSingle = totalPositions === 1;

  // Each position: who is booked in it (an accepted offer, a reserved slot, or the older per-position name).
  const resolved = positionIds.map((id, index) => {
    const slotRecord = slotRecordFor(id, index);
    const own = normalizedOffers.find(o => o.positionIndex === id && isAcceptedOffer(o));
    // A single-interpreter job has always accepted any accepted offer, and a booked/assigned status, as its one booking.
    const accepted = own || (isSingle && id === 1 ? normalizedOffers.find(isAcceptedOffer) : undefined);
    const isBooked = !isCancelled && Boolean(
      accepted ||
      slotRecord?.reservedBy ||
      (isSingle && id === 1 && (row.status === 'assigned' || row.status === 'booked' || row.status === 'Fully staffed')) ||
      legacyNameFor(id)
    );
    const name = accepted?.interpreterName || slotRecord?.interpreterName || legacyNameFor(id) || (isBooked ? 'Assigned' : undefined);
    return { id, index, slotRecord, accepted, isBooked, name };
  });

  const staffedCount = Math.min(resolved.filter(r => r.isBooked).length, totalPositions);
  const isAllPositionsFilled = staffedCount >= totalPositions && totalPositions > 0;

  // A live pending offer for a position means that position is being addressed. The replacement flag is
  // kept in the data (so it returns if the offer is declined or expires) but is not surfaced meanwhile.
  const isLivePendingOffer = (o: any): boolean =>
    (o.status === 'pending' || o.state === 'pending') &&
    o.status !== 'expired' &&
    o.state !== 'expired' &&
    new Date(o.expiresAt) > new Date() &&
    new Date(endsAt) > new Date();
  const hasPendingForPosition = (pos: number): boolean =>
    normalizedOffers.some(o => isLivePendingOffer(o) && o.positionIndex === pos);

  // Replacement flags (auto-cleared once all positions are filled)
  const needsReplacement = (r: (typeof resolved)[number]): boolean => {
    const flag = Boolean(rowData.slotReplacements?.[r.id] || r.slotRecord?.needsReplacement || (isSingle && isNeedsReplacementStatus(row.status)));
    return !isAllPositionsFilled && !r.isBooked && flag && !hasPendingForPosition(r.id);
  };
  const replacementById = new Map(resolved.map(r => [r.id, needsReplacement(r)]));
  const anyNeedsReplacement = Array.from(replacementById.values()).some(Boolean);

  const hasActivePendingOffer = normalizedOffers.some(isLivePendingOffer);

  let effectiveStatus = row.status;
  if (isCancelled) {
    effectiveStatus = 'Cancelled';
  } else if (isAllPositionsFilled) {
    effectiveStatus = row.status === 'booked' ? 'booked' : 'Fully staffed';
  } else if (anyNeedsReplacement) {
    effectiveStatus = 'Needs replacement';
  } else if (staffedCount > 0) {
    effectiveStatus = 'Partially staffed';
  } else if (hasActivePendingOffer) {
    effectiveStatus = 'Offer awaiting response';
  } else if (row.status === 'Offer awaiting response') {
    effectiveStatus = 'Unfilled / draft';
  } else {
    effectiveStatus = row.status || 'Unfilled / draft';
  }

  const slots = resolved.map(r => ({
    id: r.accepted?.id || `slot-${r.id}`,
    positionIndex: r.id,
    active: true,
    reservedBy: r.isBooked ? (r.accepted?.interpreterId || `assigned-interpreter-${r.id}`) : null,
    interpreterName: r.isBooked ? r.name : undefined,
    needsReplacement: replacementById.get(r.id) ?? false,
    followUp: false
  }));

  const cleanReference = formatReference(row.id);

  return {
    id: row.id,
    title: row.title,
    status: effectiveStatus,
    data: row.data,
    timestamp: row.createdAt.getTime(),
    dateString: row.createdAt.toLocaleDateString(),
    requester,
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
    reference: cleanReference,
    slotCount: totalPositions,
    totalPositions,
    requiredPositions: totalPositions,
    positions,
    staffedCount,
    details: {
      ...details,
      setting,
      format,
      // Keep the saved zone text (the edit form reads it); fall back to wherever else the job stored one.
      timeZone: rawJobZone(row) || "America/Los_Angeles",
      meetingLink,
      virtualLink: meetingLink,
      meetingId,
      passcode,
      accessCode: passcode,
      platform,
      virtualInstructions,
      slotCount: totalPositions,
      totalPositions,
      requiredPositions: totalPositions,
      positions,
    },
    onsite: {
      venue: onsite.venue || (isVirtual ? "Virtual" : "Location pending"),
      address: onsite.address || "",
      building: onsite.building || "",
      floor: onsite.floor || "",
      room: onsite.room || "",
      parking: onsite.parking || "",
      entrance: onsite.entrance || "",
      contact: onsite.contact || "",
      contactMethod: onsite.contactMethod || "",
    },
    overview: {
      location,
      reference: cleanReference,
      status: effectiveStatus
    },
    prepNotes: rowData.prepNotes,
    privateNotes: rowData.privateNotes,
    startsAt,
    endsAt,
    slots,
    offers: normalizedOffers,
    hasAcceptedOffer: staffedCount > 0,
    acceptedInterpretersCount: staffedCount,
    assignedInterpreterName: resolved.map((r) => r.name).find(Boolean),
    travelStartTime: row.travelStartTime ? row.travelStartTime.toISOString() : null,
    travelEndTime: row.travelEndTime ? row.travelEndTime.toISOString() : null,
    serviceCompleted: row.serviceCompleted,
    // `status` above is the staffing view (a closed job with an interpreter reads "Fully staffed"), so the closed state
    // is carried separately for the requests list's "Completed" filter.
    billingStatus: row.billingStatus ?? null,
    isCompleted: isCompletedRequest(row.status, row.billingStatus),
    // A voided job is closed like a cancelled one (status Cancelled) and also carries data.void: its own badge and filter.
    isVoided: isPlainVoidData(rowData),
    // "Unable to fill / returned to state": closed the same way, but its own badge and "Returned" filter (not a void).
    isReturned: isReturnedData(rowData),
    returnedInPortal: returnedInPortal(rowData),
    canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
    cancelReason: row.cancelReason,
    clientRequestedCancellation: row.clientRequestedCancellation,
    isStateJob: row.isStateJob,
    hoursSubmissions: rowData.hoursSubmissions || (rowData.hoursSubmission ? { 1: rowData.hoursSubmission } : {})
  };
}

export async function fetchLiveRequests() {
  await requireRole("agency");
  await ensureDisplayNameColumns();
  const dbRows = await db.select().from(requests).orderBy(desc(requests.createdAt));
  const allOffers = await db.select({
    id: offers.id,
    requestId: offers.requestId,
    interpreterId: offers.interpreterId,
    interpreterName: interpreterDisplayName,
    state: offers.status,
    status: offers.status,
    expiresAt: offers.expiresAt,
    // When the offer last changed (sent, accepted, declined, expired): tells which answer is the latest.
    updatedAt: offers.updatedAt
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id));
  
  const now = new Date();

  // Auto-expire pending offers whose appointment has passed OR whose response deadline has passed. The interpreter
  // stays on the request as an "Expired" offer (it is kept, not removed), so the agency can re-send quickly.
  for (const off of allOffers) {
    if (off.status === 'pending' || off.state === 'pending') {
      const parentRow = dbRows.find(r => r.id === off.requestId);
      if (parentRow) {
        const { endsAt } = resolveRequestTimes(parentRow);
        const endsAtDate = new Date(endsAt);
        const deadlinePassed = Boolean(off.expiresAt) && new Date(off.expiresAt).getTime() <= now.getTime();
        if ((!isNaN(endsAtDate.getTime()) && now > endsAtDate) || deadlinePassed) {
          await db.update(offers)
            .set({ status: 'expired', updatedAt: now })
            .where(eq(offers.id, off.id));
          off.status = 'expired';
          off.state = 'expired';

          const rowData = (parentRow.data as any) || {};
          let modifiedData = false;
          if (Array.isArray(rowData.offers)) {
            rowData.offers = rowData.offers.map((o: any) =>
              o.id === off.id ? { ...o, status: 'expired', state: 'expired', expiredAt: now.toISOString() } : o
            );
            modifiedData = true;
          }

          if (parentRow.status === 'Offer awaiting response') {
            const siblingOffers = allOffers.filter(o => o.requestId === parentRow.id);
            const hasOtherPending = siblingOffers.some(o => o.id !== off.id && (o.status === 'pending' || o.state === 'pending'));
            const hasAccepted = siblingOffers.some(o => o.status === 'accepted' || o.state === 'accepted');
            if (!hasOtherPending) {
              const newStatus = hasAccepted ? 'Partially staffed' : 'Unfilled / draft';
              await db.update(requests)
                .set({
                  status: newStatus,
                  data: modifiedData ? rowData : parentRow.data,
                  updatedAt: now
                })
                .where(eq(requests.id, parentRow.id));
              parentRow.status = newStatus;
            } else if (modifiedData) {
              await db.update(requests)
                .set({ data: rowData, updatedAt: now })
                .where(eq(requests.id, parentRow.id));
            }
          } else if (modifiedData) {
            await db.update(requests)
              .set({ data: rowData, updatedAt: now })
              .where(eq(requests.id, parentRow.id));
          }
        }
      }
    }
  }

  return dbRows.map(row => {
    const requestOffers = allOffers.filter(o => o.requestId === row.id);
    return mapRequestRow(row, requestOffers);
  });
}

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
    updatedAt: offers.updatedAt
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
  for (const o of requestOffers) {
    const deadlinePassed = Boolean(o.expiresAt) && new Date(o.expiresAt).getTime() <= now.getTime();
    if ((o.status === 'pending' || o.state === 'pending') && (isAppointmentPassed || deadlinePassed)) {
      await db.update(offers)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(offers.id, o.id));
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

  const mappedOffers = requestOffers.map(o => ({
    id: o.id,
    interpreterId: o.interpreterId,
    interpreterName: o.interpreterName || 'Unknown Interpreter',
    state: o.state,
    status: o.status,
    expiresAt: o.expiresAt.toISOString(),
    updatedAt: o.updatedAt.toISOString()
  }));

  return mapRequestRow(row, mappedOffers);
}
