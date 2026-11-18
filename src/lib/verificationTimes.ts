import { formatInTimeZone } from "date-fns-tz";
import type { ParsedServiceVerification } from "@/lib/odhhVerificationParser";
import { windowsFromWallClock } from "@/lib/travelWindows";
import type { TravelWindow } from "@/lib/travelWindows";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * A service verification's times as instants in the job's zone: the actual service window, and the travel legs. A time with no date
 * of its own takes the appointment's day. Pure (shared by the live intake, serviceVerification.ts, and its tests).
 */

const MAX_SHIFT_HOURS = 24;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

/** The appointment's calendar day in the job's zone. */
const appointmentDay = (appointmentStartsAt: string, zone: string): string => formatInTimeZone(new Date(appointmentStartsAt), zone, "yyyy-MM-dd");

/** The actual start and end, or what is wrong with them. */
export function computeTimes(parsed: ParsedServiceVerification, appointmentStartsAt: string, zone: string, now: number = Date.now()): { start: Date; end: Date } | string {
  const startDate = parsed.startDate ?? appointmentDay(appointmentStartsAt, zone);
  const endDate = parsed.endDate ?? startDate;
  const start = new Date(wallClockToUtc(`${startDate}T${parsed.startTime}:00`, zone));
  const end = new Date(wallClockToUtc(`${endDate}T${parsed.endTime}:00`, zone));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "The actual start or end time could not be understood.";
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (!(hours > 0)) return "The actual end time must be after the actual start time.";
  if (hours > MAX_SHIFT_HOURS) return "The actual service time cannot be longer than 24 hours.";
  if (end.getTime() > now + FUTURE_TOLERANCE_MS) return "The actual end time is in the future.";
  return { start, end };
}

/** The report's travel legs (there and back) as windows, dated like the service: the actual start's day, else the appointment's. */
export function computeTravelWindows(parsed: ParsedServiceVerification, appointmentStartsAt: string, zone: string, serviceStart: Date | null): TravelWindow[] {
  const day = parsed.startDate ?? (serviceStart ? formatInTimeZone(serviceStart, zone, "yyyy-MM-dd") : appointmentDay(appointmentStartsAt, zone));
  return windowsFromWallClock(parsed.travel, day, zone);
}
