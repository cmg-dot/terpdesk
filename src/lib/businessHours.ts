import { formatInTimeZone } from "date-fns-tz";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * Business-hour arithmetic for the hours-submission deadline: time counts only on Monday to Friday, on the agency's wall clock
 * (America/Los_Angeles); Saturday and Sunday do not count. Holidays are not excluded. Counting is in wall-clock time, so a
 * deadline falls at the same clock time on its day even across a daylight-saving change. Pure.
 *
 *   ends Friday 3:00 PM  + 48 business hours -> Tuesday 3:00 PM
 *   ends Saturday 10 AM  + 48 business hours -> Wednesday 0:00 (the clock starts Monday at midnight)
 */

export const BUSINESS_ZONE = "America/Los_Angeles";
const MINUTES_PER_DAY = 24 * 60;
const pad = (n: number): string => String(n).padStart(2, "0");

/** yyyy-MM-dd plus `days`, by the calendar (no time zone involved). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 1 = Monday ... 7 = Sunday, for a yyyy-MM-dd. */
const isoWeekday = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
};

/** The instant `hours` business hours after `start`. */
export function addBusinessHours(start: Date, hours: number, zone: string = BUSINESS_ZONE): Date {
  let day = formatInTimeZone(start, zone, "yyyy-MM-dd");
  let minute = Number(formatInTimeZone(start, zone, "H")) * 60 + Number(formatInTimeZone(start, zone, "m"));
  let remaining = Math.max(0, Math.round(hours * 60));
  // At most a few weeks of days for any sensible input; the bound only guards against a bad argument.
  for (let guard = 0; guard < 3660; guard += 1) {
    if (isoWeekday(day) >= 6) {
      day = addDays(day, 1);
      minute = 0;
      continue;
    }
    const left = MINUTES_PER_DAY - minute;
    if (remaining <= left) {
      const at = minute + remaining;
      const [wallDay, wallMinute] = at === MINUTES_PER_DAY ? [addDays(day, 1), 0] : [day, at];
      return new Date(wallClockToUtc(`${wallDay}T${pad(Math.floor(wallMinute / 60))}:${pad(wallMinute % 60)}:00`, zone));
    }
    remaining -= left;
    day = addDays(day, 1);
    minute = 0;
  }
  throw new Error("addBusinessHours: hours out of range");
}

/** The SLA window for submitting hours after an appointment ends. */
export const HOURS_SLA_BUSINESS_HOURS = 48;

/**
 * Only appointments that END on or after this agency-local date are held to the deadline, so older jobs are never flagged. From the
 * HOURS_SLA_START env var (yyyy-MM-dd), else 2026-11-16. SERVER ONLY (the env var is not sent to the browser).
 */
export function hoursSlaStart(): Date {
  const configured = process.env.HOURS_SLA_START?.trim();
  const date = configured && /^\d{4}-\d{2}-\d{2}$/.test(configured) ? configured : "2026-11-16";
  return new Date(wallClockToUtc(`${date}T00:00:00`, BUSINESS_ZONE));
}
