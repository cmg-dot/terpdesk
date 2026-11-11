import { settingLabel } from "@/lib/settingLabel";
import { formatReference, isCompletedRequest, isNeedsReplacementStatus } from "@/utils/statusEngine";
import { isPlainVoidData, isReturnedData, returnedInPortal } from "@/lib/voidReasons";
import { rawJobZone, resolveRequestTimes } from "@/utils/timezone";
import { positionIdOf, positionsLabel, readPositions } from "@/lib/positions";

/**
 * One request as the agency screens use it: its staffing worked out from its positions, slots and offers (who is booked, whether an
 * offer is waiting, whether a position needs replacing) and its schedule resolved. The ONE place that rule lives: the full loader
 * (fetchLiveRequests, fetchLiveRequestById) returns this as is, and the lean list rows (requestListRow.ts) are cut from it, so a list
 * can never disagree with the detail page about what state a job is in. Pure: no database, safe on the server only because it
 * reads the whole data blob.
 */

export function mapRequestRow(row: any, requestOffers: any[]) {
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

/** A request as mapRequestRow returns it. */
export type MappedRequest = ReturnType<typeof mapRequestRow>;
