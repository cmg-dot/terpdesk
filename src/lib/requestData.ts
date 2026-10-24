import type { RequestData } from "@/db/schema";

/**
 * Fills in the derived fields every new request carries (the appointment's start/end repeated where the app reads
 * them, the position count, and the repeat settings), from the caller's data and the computed start/end.
 * Shared by the agency form (createRequest) and the public intake form so both produce the same shape.
 *
 * Pure: no database access.
 */
export function normalizeRequestData(data: RequestData, startsAtIso: string, endsAtIso: string): RequestData {
  const isRepeats = Boolean(data?.repeats ?? data?.details?.repeats ?? false);
  const recurrenceNoteStr = String(data?.recurrenceNote ?? data?.details?.recurrenceNote ?? "").trim();

  const rawPositions = String(data?.positions ?? data?.details?.positions ?? "One interpreter");
  const slotCount = (data?.slotCount === 2 || data?.details?.slotCount === 2 || data?.requiredPositions === 2 || rawPositions === "Team — two independent positions") ? 2 : 1;
  const positionsStr = slotCount === 2 ? "Team — two independent positions" : "One interpreter";

  return {
    ...data,
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
      ...(data?.details || {}),
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      customStartsAt: startsAtIso,
      customEndsAt: endsAtIso,
      startDate: data?.details?.startDate,
      startTime: data?.details?.startTime,
      endDate: data?.details?.endDate,
      endTime: data?.details?.endTime,
      timeZone: data?.details?.timeZone,
      timezone: data?.details?.timeZone,
      repeats: isRepeats,
      recurrenceNote: recurrenceNoteStr,
      positions: positionsStr,
      requiredPositions: slotCount,
      slotCount: slotCount,
    },
    overview: {
      ...(data?.overview || {}),
      startsAt: startsAtIso,
      endsAt: endsAtIso,
    },
    intake: {
      ...((data as any)?.intake || {}),
      repeats: isRepeats,
      recurrenceNote: recurrenceNoteStr,
      positions: positionsStr,
      requiredPositions: slotCount,
      slotCount: slotCount,
    },
  };
}
