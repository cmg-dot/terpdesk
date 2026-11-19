import { formatInTimeZone } from "date-fns-tz";
import type { ParsedServiceVerification } from "@/lib/odhhVerificationParser";
import { MAX_OVERNIGHT_HOURS, nextIsoDay } from "@/lib/odhhSchedule";
import { windowsFromWallClock } from "@/lib/travelWindows";
import type { TravelWindow } from "@/lib/travelWindows";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * A service verification's times as instants in the job's zone: the actual service window, and the travel legs. A time with no date
 * of its own takes the report's booking date ("BOOKING Appointment Date and Time"), else the appointment's day on the job. Pure
 * (shared by the live intake, serviceVerification.ts, and its tests).
 */

const MAX_SHIFT_HOURS = 24;
const FUTURE_TOLERANCE_MS = 10 * 60_000;

/** The appointment's calendar day in the job's zone. */
const appointmentDay = (appointmentStartsAt: string, zone: string): string => formatInTimeZone(new Date(appointmentStartsAt), zone, "yyyy-MM-dd");

type ReportTimes = Pick<ParsedServiceVerification, "startDate" | "startTime" | "endDate" | "endTime" | "bookingDate" | "travel">;

/** The day the report's undated times belong to: its own start date, the booking date it states, else the job's day. */
const serviceDay = (parsed: ReportTimes, appointmentStartsAt: string, zone: string): string =>
  parsed.startDate ?? parsed.bookingDate ?? appointmentDay(appointmentStartsAt, zone);

export interface ActualTimes {
  start: Date;
  end: Date;
  /** The report's end time is earlier in the day than its start, and it gives no end date: read as the next morning. */
  endsNextDay: boolean;
}

/**
 * The actual start and end, or what is wrong with them. An undated end earlier than the start ("9:30 PM" to "1:00 AM") is the next
 * day when that makes the service MAX_OVERNIGHT_HOURS or shorter; the same start and end is still refused.
 */
export function computeTimes(parsed: ReportTimes, appointmentStartsAt: string, zone: string, now: number = Date.now()): ActualTimes | string {
  const startDate = serviceDay(parsed, appointmentStartsAt, zone);
  const start = new Date(wallClockToUtc(`${startDate}T${parsed.startTime}:00`, zone));
  let end = new Date(wallClockToUtc(`${parsed.endDate ?? startDate}T${parsed.endTime}:00`, zone));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "The actual start or end time could not be understood.";
  let endsNextDay = false;
  if (end <= start && parsed.endDate === null && parsed.startTime !== parsed.endTime) {
    const nextMorning = new Date(wallClockToUtc(`${nextIsoDay(startDate)}T${parsed.endTime}:00`, zone));
    if ((nextMorning.getTime() - start.getTime()) / 3_600_000 <= MAX_OVERNIGHT_HOURS) {
      end = nextMorning;
      endsNextDay = true;
    }
  }
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (!(hours > 0)) return "The actual end time must be after the actual start time.";
  if (hours > MAX_SHIFT_HOURS) return "The actual service time cannot be longer than 24 hours.";
  if (end.getTime() > now + FUTURE_TOLERANCE_MS) return "The actual end time is in the future.";
  return { start, end, endsNextDay };
}

/** The report's travel legs (there and back) as windows, dated like the service: the report's own day, else the actual start's, else the appointment's. */
export function computeTravelWindows(parsed: ReportTimes, appointmentStartsAt: string, zone: string, serviceStart: Date | null): TravelWindow[] {
  const day = parsed.startDate ?? parsed.bookingDate ?? (serviceStart ? formatInTimeZone(serviceStart, zone, "yyyy-MM-dd") : appointmentDay(appointmentStartsAt, zone));
  return windowsFromWallClock(parsed.travel, day, zone);
}
