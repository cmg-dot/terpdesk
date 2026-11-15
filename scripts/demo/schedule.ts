import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Times for the demo jobs, all anchored to the moment the seed runs and read in the agency's zone (Pacific), so "today", "tomorrow"
 * and "yesterday" mean what the demo audience sees on the calendar. Re-run the seed on the morning of a demo to re-anchor them.
 */

export const ZONE = "America/Los_Angeles";
/** The label the request form saves in details.timeZone (it maps to ZONE). */
export const ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";

const MINUTE = 60_000;

/** The calendar date `days` after today in the agency's zone (yyyy-MM-dd). Day arithmetic on the date itself, so DST cannot shift it. */
export function localDate(now: Date, days: number): string {
  const [y, m, d] = formatInTimeZone(now, ZONE, "yyyy-MM-dd").split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `days` from today at the wall-clock time `hhmm` ("09:30") in the agency's zone, as an absolute instant. */
export const at = (now: Date, days: number, hhmm: string): Date => fromZonedTime(`${localDate(now, days)}T${hhmm}:00`, ZONE);

/** `now` rounded down to the half hour, moved by `minutes`: for the jobs happening right now. */
export function aroundNow(now: Date, minutes: number): Date {
  const half = 30 * MINUTE;
  return new Date(Math.floor(now.getTime() / half) * half + minutes * MINUTE);
}

export const plusMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * MINUTE);

/** The wall-clock fields the request form stores next to the instants. */
export function wallClock(start: Date, end: Date) {
  return {
    startDate: formatInTimeZone(start, ZONE, "yyyy-MM-dd"),
    startTime: formatInTimeZone(start, ZONE, "HH:mm"),
    endDate: formatInTimeZone(end, ZONE, "yyyy-MM-dd"),
    endTime: formatInTimeZone(end, ZONE, "HH:mm"),
  };
}
