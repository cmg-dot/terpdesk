"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatReference, isNeedsReplacementStatus } from "@/utils/statusEngine";
import { resolveRequestTimes } from "@/utils/timezone";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";

function mapRequestRow(row: any, requestOffers: any[]) {
  const rowData = (row.data as any) || {};
  const details = rowData.details || {};
  const onsite = rowData.onsite || {};
  const requester = rowData.requester || { org: rowData?.intake?.program || "General" };

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

  const totalPositions = (rowData.slotCount === 2 || rowData.details?.slotCount === 2 || rowData.positions === "Team — two independent positions" || rowData.requiredPositions === 2 || details.positions === "Team — two independent positions" || details.requiredPositions === 2) ? 2 : 1;
  const positions = totalPositions === 2 ? "Team — two independent positions" : "One interpreter";

  const { startsAt, endsAt } = resolveRequestTimes(row);
  
  const offerPositions = rowData.offerPositions || {};
  const normalizedOffers = requestOffers.map(o => {
    const posIdx = (offerPositions[o.id] ?? (o as any).positionIndex ?? 1) as 1 | 2;
    return {
      ...o,
      positionIndex: posIdx,
      status: o.status || o.state || 'pending',
      state: o.state || o.status || 'pending',
      expiresAt: typeof o.expiresAt === 'string' ? o.expiresAt : (o.expiresAt ? new Date(o.expiresAt).toISOString() : new Date().toISOString())
    };
  });

  const isCancelled = row.status === 'Cancelled' || row.status === 'cancelled';

  // Slot 1 Resolution
  const acceptedOffer1 = normalizedOffers.find(o => o.positionIndex === 1 && (o.status === 'accepted' || o.state === 'accepted'));
  const fallbackAccepted1 = acceptedOffer1 || (!acceptedOffer1 && totalPositions === 1 ? normalizedOffers.find(o => o.status === 'accepted' || o.state === 'accepted') : null);
  const isSlot1AssignedOrBooked = !isCancelled && Boolean(
    fallbackAccepted1 ||
    rowData.slots?.[0]?.reservedBy ||
    (totalPositions === 1 && (row.status === 'assigned' || row.status === 'booked' || row.status === 'Fully staffed')) ||
    rowData.assignedInterpreterName
  );
  const slot1InterpreterName = fallbackAccepted1?.interpreterName || rowData.slots?.[0]?.interpreterName || rowData.assignedInterpreterName || (isSlot1AssignedOrBooked ? 'Assigned' : undefined);

  // Slot 2 Resolution
  const acceptedOffer2 = normalizedOffers.find(o => o.positionIndex === 2 && (o.status === 'accepted' || o.state === 'accepted'));
  const isSlot2AssignedOrBooked = !isCancelled && totalPositions === 2 && Boolean(
    acceptedOffer2 ||
    rowData.slots?.[1]?.reservedBy ||
    rowData.position2InterpreterName
  );
  const slot2InterpreterName = acceptedOffer2?.interpreterName || rowData.slots?.[1]?.interpreterName || rowData.position2InterpreterName || (isSlot2AssignedOrBooked ? 'Assigned' : undefined);

  let staffedCount = (isSlot1AssignedOrBooked ? 1 : 0) + (isSlot2AssignedOrBooked ? 1 : 0);
  if (staffedCount > totalPositions) staffedCount = totalPositions;
  const isAllPositionsFilled = staffedCount >= totalPositions && totalPositions > 0;

  // A live pending offer for a position means that position is being addressed. The replacement flag is
  // kept in the data (so it returns if the offer is declined or expires) but is not surfaced meanwhile.
  const isLivePendingOffer = (o: any): boolean =>
    (o.status === 'pending' || o.state === 'pending') &&
    o.status !== 'expired' &&
    o.state !== 'expired' &&
    new Date(o.expiresAt) > new Date() &&
    new Date(endsAt) > new Date();
  const hasPendingForPosition = (pos: 1 | 2): boolean =>
    normalizedOffers.some(o => isLivePendingOffer(o) && (o.positionIndex === pos || (!o.positionIndex && pos === 1)));

  // Replacement flags (auto-cleared once all positions are filled)
  const slot1ReplacementFlag = Boolean(rowData.slotReplacements?.[1] || rowData.slots?.[0]?.needsReplacement || (totalPositions === 1 && isNeedsReplacementStatus(row.status)));
  const effectiveSlot1NeedsReplacement = !isAllPositionsFilled && !isSlot1AssignedOrBooked && slot1ReplacementFlag && !hasPendingForPosition(1);

  const slot2ReplacementFlag = totalPositions === 2 && Boolean(rowData.slotReplacements?.[2] || rowData.slots?.[1]?.needsReplacement);
  const effectiveSlot2NeedsReplacement = !isAllPositionsFilled && !isSlot2AssignedOrBooked && slot2ReplacementFlag && !hasPendingForPosition(2);

  const anyNeedsReplacement = effectiveSlot1NeedsReplacement || effectiveSlot2NeedsReplacement;

  const hasActivePendingOffer = normalizedOffers.some(isLivePendingOffer);

  let effectiveStatus = row.status;
  if (isCancelled) {
    effectiveStatus = 'Cancelled';
  } else if (isAllPositionsFilled) {
    effectiveStatus = row.status === 'booked' ? 'booked' : 'Fully staffed';
  } else if (anyNeedsReplacement) {
    effectiveStatus = 'Needs replacement';
  } else if (totalPositions === 2 && staffedCount === 1) {
    effectiveStatus = 'Partially staffed';
  } else if (hasActivePendingOffer) {
    effectiveStatus = 'Offer awaiting response';
  } else if (row.status === 'Offer awaiting response') {
    effectiveStatus = (totalPositions === 2 && staffedCount === 1) ? 'Partially staffed' : 'Unfilled / draft';
  } else {
    effectiveStatus = row.status || 'Unfilled / draft';
  }

  const slots = [
    {
      id: fallbackAccepted1?.id || 'slot-1',
      positionIndex: 1,
      active: true,
      reservedBy: isSlot1AssignedOrBooked ? (fallbackAccepted1?.interpreterId || 'assigned-interpreter-1') : null,
      interpreterName: isSlot1AssignedOrBooked ? slot1InterpreterName : undefined,
      needsReplacement: effectiveSlot1NeedsReplacement,
      followUp: false
    },
    ...(totalPositions === 2 ? [{
      id: acceptedOffer2?.id || 'slot-2',
      positionIndex: 2,
      active: true,
      reservedBy: isSlot2AssignedOrBooked ? (acceptedOffer2?.interpreterId || 'assigned-interpreter-2') : null,
      interpreterName: isSlot2AssignedOrBooked ? slot2InterpreterName : undefined,
      needsReplacement: effectiveSlot2NeedsReplacement,
      followUp: false
    }] : [])
  ];

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
      timeZone: details.timeZone || "America/Los_Angeles",
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
    assignedInterpreterName: slot1InterpreterName || slot2InterpreterName,
    travelStartTime: row.travelStartTime ? row.travelStartTime.toISOString() : null,
    travelEndTime: row.travelEndTime ? row.travelEndTime.toISOString() : null,
    serviceCompleted: row.serviceCompleted,
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
    expiresAt: offers.expiresAt
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id));
  
  const now = new Date();

  // Auto-expire pending offers whose parent request has passed
  for (const off of allOffers) {
    if (off.status === 'pending' || off.state === 'pending') {
      const parentRow = dbRows.find(r => r.id === off.requestId);
      if (parentRow) {
        const { endsAt } = resolveRequestTimes(parentRow);
        const endsAtDate = new Date(endsAt);
        if (!isNaN(endsAtDate.getTime()) && now > endsAtDate) {
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
    expiresAt: offers.expiresAt
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id))
  .where(eq(offers.requestId, id));

  const now = new Date();
  const { endsAt } = resolveRequestTimes(row);
  const endsAtDate = new Date(endsAt);
  const isAppointmentPassed = !isNaN(endsAtDate.getTime()) && now > endsAtDate;

  // Auto-expire pending offers if appointment passed
  let anyExpired = false;
  for (const o of requestOffers) {
    if ((o.status === 'pending' || o.state === 'pending') && isAppointmentPassed) {
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
    expiresAt: o.expiresAt.toISOString()
  }));

  return mapRequestRow(row, mappedOffers);
}
