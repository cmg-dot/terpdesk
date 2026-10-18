"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isStateProgram } from "@/lib/stateJob";
import { buildAppointmentUtcTimes, getIanaZone } from "@/utils/timezone";

export interface UpdateRequestPayload {
  title?: string;
  appointmentTitle?: string;
  setting?: string;
  format?: string;
  location?: string;
  timeZone?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
  details?: Record<string, any>;
  onsite?: Record<string, any>;
  requester?: Record<string, any>;
  overview?: Record<string, any>;
  prepNotes?: string;
  privateNotes?: string;
  positions?: string;
  requiredPositions?: number;
  slotCount?: number;
  data?: Record<string, any>;
  status?: string;
  [key: string]: any;
}

export async function updateRequestAction(requestId: string, payload: UpdateRequestPayload) {
  await requireRole("agency");
  const rows = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!rows || rows.length === 0) {
    throw new Error("Request not found");
  }
  const existing = rows[0];
  const existingData = (existing.data as any) || {};
  const existingDetails = existingData.details || {};
  const existingOnsite = existingData.onsite || {};
  const existingRequester = existingData.requester || {};

  // 1. Resolve Timezone & Dates
  const targetTz = payload.timeZone || payload.details?.timeZone || existingDetails.timeZone || "Pacific Time — Seattle, Los Angeles";
  const startDate = payload.startDate || payload.details?.startDate || existingDetails.startDate;
  const startTime = payload.startTime || payload.details?.startTime || existingDetails.startTime;
  const endDate = payload.endDate || payload.details?.endDate || existingDetails.endDate || startDate;
  const endTime = payload.endTime || payload.details?.endTime || existingDetails.endTime;

  let startsAtIso: string;
  let endsAtIso: string;

  if (startDate && startTime && endTime) {
    const times = buildAppointmentUtcTimes({
      date: startDate,
      startTime,
      endDate,
      endTime,
      timeZone: targetTz,
    });
    startsAtIso = times.startsAt;
    endsAtIso = times.endsAt;
  } else if (payload.startsAt && payload.endsAt) {
    startsAtIso = typeof payload.startsAt === 'string' ? payload.startsAt : payload.startsAt.toISOString();
    endsAtIso = typeof payload.endsAt === 'string' ? payload.endsAt : payload.endsAt.toISOString();
  } else if (payload.startsAt) {
    startsAtIso = typeof payload.startsAt === 'string' ? payload.startsAt : payload.startsAt.toISOString();
    endsAtIso = existingData.endsAt || existingDetails.endsAt || new Date(new Date(startsAtIso).getTime() + 3600000).toISOString();
  } else {
    startsAtIso = existingData.startsAt || existingDetails.startsAt || existing.createdAt.toISOString();
    endsAtIso = existingData.endsAt || existingDetails.endsAt || new Date(new Date(startsAtIso).getTime() + 3600000).toISOString();
  }

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    throw new Error("The end time must be after the start time.");
  }

  // 2. Resolve Title, Setting, Format, and Location
  const newTitle = payload.appointmentTitle || payload.title || existing.title;
  const newSetting = payload.setting || payload.details?.setting || existingData.setting || existingDetails.setting || "Medical";
  const newFormat = payload.format || payload.details?.format || payload.modality || existingData.format || existingDetails.format || "In person";
  const isVirtual = newFormat.toLowerCase().includes('virtual');

  const newVenue = payload.onsite?.venue || payload.venue || existingOnsite.venue;
  const newAddress = payload.onsite?.address || payload.address || existingOnsite.address;
  const newLocation = isVirtual
    ? "Virtual"
    : (newVenue ? (newAddress ? `${newVenue} · ${newAddress}` : newVenue) : (newAddress || existingData.location || "Location pending"));

  const rawPositions = payload.positions ?? payload.details?.positions ?? existingData.positions ?? existingDetails.positions ?? "One interpreter";
  const slotCount = payload.slotCount ?? payload.details?.slotCount ?? payload.requiredPositions ?? (rawPositions === "Team — two independent positions" ? 2 : 1);
  const positionsStr = slotCount === 2 ? "Team — two independent positions" : "One interpreter";

  // 3. Assemble Overwritten Data (both top-level and cached details fields)
  const updatedDetails = {
    ...existingDetails,
    ...(payload.details || {}),
    setting: newSetting,
    format: newFormat,
    timeZone: targetTz,
    timezone: targetTz,
    startDate: startDate || existingDetails.startDate,
    startTime: startTime || existingDetails.startTime,
    endDate: endDate || existingDetails.endDate,
    endTime: endTime || existingDetails.endTime,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    customStartsAt: startsAtIso,
    customEndsAt: endsAtIso,
    deafParticipant: payload.details?.deafParticipant ?? payload.deafParticipant ?? existingDetails.deafParticipant,
    peopleNeeding: payload.details?.peopleNeeding ?? payload.peopleNeeding ?? existingDetails.peopleNeeding,
    commPreferences: payload.details?.commPreferences ?? payload.commPreferences ?? existingDetails.commPreferences,
    purpose: payload.details?.purpose ?? payload.purpose ?? existingDetails.purpose,
    qualifications: payload.details?.qualifications ?? payload.qualifications ?? existingDetails.qualifications,
    repeats: payload.details?.repeats ?? payload.repeats ?? existingDetails.repeats,
    recurrenceNote: payload.details?.recurrenceNote ?? payload.recurrenceNote ?? existingDetails.recurrenceNote,
    positions: positionsStr,
    requiredPositions: slotCount,
    slotCount: slotCount,
  };

  const updatedOnsite = {
    ...existingOnsite,
    ...(payload.onsite || {}),
    venue: newVenue,
    address: newAddress,
    building: payload.onsite?.building ?? payload.building ?? existingOnsite.building,
    parking: payload.onsite?.parking ?? payload.parking ?? existingOnsite.parking,
    entrance: payload.onsite?.entrance ?? payload.entrance ?? existingOnsite.entrance,
    contact: payload.onsite?.contact ?? payload.onsiteContactName ?? existingOnsite.contact,
    contactMethod: payload.onsite?.contactMethod ?? payload.onsiteContactPhone ?? existingOnsite.contactMethod,
  };

  const updatedRequester = {
    ...existingRequester,
    ...(payload.requester || {}),
    name: payload.requester?.name ?? payload.requesterName ?? existingRequester.name,
    org: payload.requester?.org ?? payload.requesterOrg ?? existingRequester.org,
    email: payload.requester?.email ?? payload.email ?? existingRequester.email,
    phone: payload.requester?.phone ?? payload.phone ?? existingRequester.phone,
    prefContact: payload.requester?.prefContact ?? payload.prefContact ?? existingRequester.prefContact,
    reqInterpreter: payload.requester?.reqInterpreter ?? payload.prefInterpreter ?? existingRequester.reqInterpreter,
    teamSuggested: payload.requester?.teamSuggested ?? payload.teamSuggested ?? existingRequester.teamSuggested,
    billOrg: payload.requester?.billOrg ?? payload.billOrg ?? existingRequester.billOrg,
    billContact: payload.requester?.billContact ?? payload.billContact ?? existingRequester.billContact,
    billEmail: payload.requester?.billEmail ?? payload.billEmail ?? existingRequester.billEmail,
    poNumber: payload.requester?.poNumber ?? payload.poNumber ?? existingRequester.poNumber,
  };

  const updatedData = {
    ...existingData,
    ...(payload.data || {}),
    setting: newSetting,
    format: newFormat,
    location: newLocation,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    customStartsAt: startsAtIso,
    customEndsAt: endsAtIso,
    prepNotes: payload.prepNotes ?? existingData.prepNotes,
    privateNotes: payload.privateNotes ?? existingData.privateNotes,
    positions: positionsStr,
    requiredPositions: slotCount,
    slotCount: slotCount,
    repeats: payload.repeats ?? payload.details?.repeats ?? existingData.repeats,
    recurrenceNote: payload.recurrenceNote ?? payload.details?.recurrenceNote ?? existingData.recurrenceNote,
    details: updatedDetails,
    onsite: updatedOnsite,
    requester: updatedRequester,
    overview: {
      ...(existingData.overview || {}),
      ...(payload.overview || {}),
      location: newLocation,
      reference: existing.id,
      status: payload.status || existing.status,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
    },
    intake: {
      ...(existingData.intake || {}),
      ...(payload.data?.intake || {}),
      repeats: payload.repeats ?? payload.details?.repeats ?? existingData.repeats,
      recurrenceNote: payload.recurrenceNote ?? payload.details?.recurrenceNote ?? existingData.recurrenceNote,
      positions: positionsStr,
      requiredPositions: slotCount,
      slotCount: slotCount,
    }
  };

  // State job = funding program is ODHH or Apple Health. Derived here, never sent by the client.
  const isStateJob = isStateProgram(payload.data?.intake?.program ?? payload.intake?.program ?? existingData.intake?.program);

  // 4. Update Database Row
  const [updated] = await db.update(requests)
    .set({
      title: newTitle,
      createdAt: new Date(startsAtIso),
      data: updatedData,
      isStateJob,
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId))
    .returning();

  // 5. Revalidate All Platform Routes
  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/edit`);
  revalidatePath('/requests');
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');
  revalidatePath('/interpreter-calendar');

  return updated;
}
