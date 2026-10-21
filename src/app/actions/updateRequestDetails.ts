"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildAppointmentUtcTimes } from "@/utils/timezone";
import { EDIT_LOCKED_MESSAGE, isRequestEditLocked } from "@/lib/offerLock";

export interface UpdateRequestDetailsPayload {
  requestId: string;
  setting?: string;
  format?: string;
  location?: string;
  venue?: string;
  address?: string;
  building?: string;
  contact?: string;
  contactMethod?: string;
  meetingLink?: string;
  meetingId?: string;
  passcode?: string;
  platform?: string;
  virtualInstructions?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timeZone?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
}

export type UpdateRequestDetailsResult =
  | { success: true; request: typeof requests.$inferSelect }
  | { success: false; error: string };

/**
 * Quick edit. Refused while offers are live or an interpreter is booked (same rule as "Edit assignment", enforced
 * here on the server). Problems are returned, not thrown: in production a thrown message is hidden from the browser.
 */
export async function updateRequestDetails(payload: UpdateRequestDetailsPayload): Promise<UpdateRequestDetailsResult> {
  await requireRole("agency");
  const rows = await db.select().from(requests).where(eq(requests.id, payload.requestId));
  if (!rows || rows.length === 0) {
    return { success: false, error: "This request no longer exists." };
  }
  const existing = rows[0];
  if (await isRequestEditLocked(payload.requestId)) return { success: false, error: EDIT_LOCKED_MESSAGE };

  const existingData = (existing.data as any) || {};
  const existingDetails = existingData.details || {};
  const existingOnsite = existingData.onsite || {};

  const newFormat = payload.format || existingDetails.format || existingData.format || "Virtual";
  const newSetting = payload.setting || existingDetails.setting || existingData.setting || "Medical";
  const isVirtual = newFormat.toLowerCase().includes('virtual');

  const newMeetingLink = payload.meetingLink !== undefined ? payload.meetingLink : (existingDetails.meetingLink || existingDetails.virtualLink || null);
  const newPasscode = payload.passcode !== undefined ? payload.passcode : (existingDetails.passcode || existingDetails.accessCode || null);
  const newMeetingId = payload.meetingId !== undefined ? payload.meetingId : (existingDetails.meetingId || null);
  const newPlatform = payload.platform !== undefined ? payload.platform : (existingDetails.platform || (newMeetingLink?.includes('zoom') ? 'Zoom' : 'Virtual'));
  const newVirtualInstructions = payload.virtualInstructions !== undefined ? payload.virtualInstructions : (existingDetails.virtualInstructions || null);

  const newVenue = payload.venue !== undefined ? payload.venue : (payload.location !== undefined ? payload.location : existingOnsite.venue);
  const newAddress = payload.address !== undefined ? payload.address : existingOnsite.address;
  const newBuilding = payload.building !== undefined ? payload.building : existingOnsite.building;
  const newContact = payload.contact !== undefined ? payload.contact : existingOnsite.contact;
  const newContactMethod = payload.contactMethod !== undefined ? payload.contactMethod : existingOnsite.contactMethod;

  const newLocation = isVirtual
    ? (newPlatform ? `${newPlatform} (Virtual)` : "Virtual")
    : (newVenue ? (newAddress ? `${newVenue} · ${newAddress}` : newVenue) : (newAddress || "Location pending"));

  // Resolve Timezone & Dates
  const targetTz = payload.timeZone || existingDetails.timeZone || "Pacific Time — Seattle, Los Angeles";
  const startDate = payload.startDate || existingDetails.startDate;
  const startTime = payload.startTime || existingDetails.startTime;
  const endDate = payload.endDate || existingDetails.endDate || startDate;
  const endTime = payload.endTime || existingDetails.endTime;

  let startsAtIso: string = existingData.startsAt || existingDetails.startsAt || existing.createdAt.toISOString();
  let endsAtIso: string = existingData.endsAt || existingDetails.endsAt || new Date(new Date(startsAtIso).getTime() + 3600000).toISOString();

  if (payload.startDate && payload.startTime && payload.endTime) {
    const times = buildAppointmentUtcTimes({
      date: payload.startDate,
      startTime: payload.startTime,
      endDate: payload.endDate || payload.startDate,
      endTime: payload.endTime,
      timeZone: targetTz,
    });
    startsAtIso = times.startsAt;
    endsAtIso = times.endsAt;
  } else if (payload.startsAt && payload.endsAt) {
    startsAtIso = typeof payload.startsAt === 'string' ? payload.startsAt : payload.startsAt.toISOString();
    endsAtIso = typeof payload.endsAt === 'string' ? payload.endsAt : payload.endsAt.toISOString();
  }

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    return { success: false, error: "The end time must be after the start time." };
  }

  const updatedData = {
    ...existingData,
    setting: newSetting,
    format: newFormat,
    location: newLocation,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    customStartsAt: startsAtIso,
    customEndsAt: endsAtIso,
    details: {
      ...existingDetails,
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
      meetingLink: newMeetingLink,
      virtualLink: newMeetingLink,
      passcode: newPasscode,
      accessCode: newPasscode,
      meetingId: newMeetingId,
      platform: newPlatform,
      virtualInstructions: newVirtualInstructions,
    },
    onsite: {
      ...existingOnsite,
      venue: newVenue,
      address: newAddress,
      building: newBuilding,
      contact: newContact,
      contactMethod: newContactMethod,
    },
    overview: {
      ...(existingData.overview || {}),
      location: newLocation,
      reference: existing.id,
      status: existing.status,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
    }
  };

  const [updated] = await db.update(requests)
    .set({
      createdAt: new Date(startsAtIso),
      data: updatedData,
      updatedAt: new Date()
    })
    .where(eq(requests.id, payload.requestId))
    .returning();

  revalidatePath(`/requests/${payload.requestId}`);
  revalidatePath('/requests');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');
  revalidatePath('/interpreter-calendar');

  return { success: true, request: updated };
}
