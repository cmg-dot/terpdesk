"use server";

import { db } from "@/db";
import { requests, RequestData } from "@/db/schema";
import { revalidatePath } from "next/cache";

interface CreateRequestPayload {
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  data: RequestData;
}

export async function createRequest(payload: CreateRequestPayload) {
  const startsAtIso = typeof payload.startsAt === 'string' ? payload.startsAt : payload.startsAt.toISOString();
  const endsAtIso = typeof payload.endsAt === 'string' ? payload.endsAt : payload.endsAt.toISOString();

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    throw new Error("The end time must be after the start time.");
  }

  const isRepeats = Boolean(payload.data?.repeats ?? payload.data?.details?.repeats ?? false);
  const recurrenceNoteStr = String(payload.data?.recurrenceNote ?? payload.data?.details?.recurrenceNote ?? '').trim();

  const rawPositions = String(payload.data?.positions ?? payload.data?.details?.positions ?? 'One interpreter');
  const slotCount = (payload.data?.slotCount === 2 || payload.data?.details?.slotCount === 2 || payload.data?.requiredPositions === 2 || rawPositions === "Team — two independent positions") ? 2 : 1;
  const positionsStr = slotCount === 2 ? "Team — two independent positions" : "One interpreter";

  const requestData: RequestData = {
    ...payload.data,
    repeats: isRepeats,
    recurrenceNote: recurrenceNoteStr,
    startsAt: startsAtIso,
    endsAt: endsAtIso,
    customStartsAt: startsAtIso,
    customEndsAt: endsAtIso,
    positions: positionsStr,
    requiredPositions: slotCount,
    slotCount: slotCount,
    details: {
      ...(payload.data?.details || {}),
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      customStartsAt: startsAtIso,
      customEndsAt: endsAtIso,
      startDate: payload.data?.details?.startDate,
      startTime: payload.data?.details?.startTime,
      endDate: payload.data?.details?.endDate,
      endTime: payload.data?.details?.endTime,
      timeZone: payload.data?.details?.timeZone,
      timezone: payload.data?.details?.timeZone,
      repeats: isRepeats,
      recurrenceNote: recurrenceNoteStr,
      positions: positionsStr,
      requiredPositions: slotCount,
      slotCount: slotCount,
    },
    overview: {
      ...(payload.data?.overview || {}),
      startsAt: startsAtIso,
      endsAt: endsAtIso,
    },
    intake: {
      ...((payload.data as any)?.intake || {}),
      repeats: isRepeats,
      recurrenceNote: recurrenceNoteStr,
      positions: positionsStr,
      requiredPositions: slotCount,
      slotCount: slotCount,
    }
  };

  const [newRequest] = await db.insert(requests).values({
    title: payload.title,
    status: 'draft',
    createdAt: new Date(startsAtIso),
    data: requestData
  }).returning({ id: requests.id });

  revalidatePath('/requests');
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');
  revalidatePath('/interpreter-calendar');
  
  return newRequest.id;
}
