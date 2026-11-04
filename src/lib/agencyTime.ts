import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_AGENCY_TIME_ZONE } from "@/lib/agency";

/**
 * The agency's calendar clock. ASL Professionals works in Washington State, so every operational date on the agency
 * calendar ("today", which day an appointment falls on, the times shown) is read in America/Los_Angeles, never in the
 * zone of whoever has the page open. Pure functions, no I/O: safe in client components.
 *
 * A calendar day is carried as a "civil date": a Date built from year / month / day numbers at LOCAL NOON, which is only
 * ever read back through its local year / month / day (never its instant). Noon keeps it on the same date whatever the
 * browser's offset or daylight-saving change, so the grid, the week and the month are the same days for everyone.
 */

export const AGENCY_TIME_ZONE = DEFAULT_AGENCY_TIME_ZONE;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** yyyy-MM-dd of a civil date, from its local year / month / day. */
export const civilKey = (date: Date): string =>
  `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The civil date for yyyy-MM-dd (local noon). Throws on anything that is not that format. */
export const civilDate = (key: string): Date => {
  const match = DATE_KEY.exec(key);
  if (!match) throw new Error("Not a date.");
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
};

/** The agency-zone calendar day (yyyy-MM-dd) that an instant falls on. */
export const agencyDateKey = (instant: Date | string | number): string => formatInTimeZone(instant, AGENCY_TIME_ZONE, "yyyy-MM-dd");

/** "Today" on the agency's calendar: the Los Angeles date, whatever the browser's clock or zone says. */
export const agencyToday = (nowMs: number = Date.now()): Date => civilDate(agencyDateKey(nowMs));

/** "9:00 AM – 10:30 AM PST" for an appointment, always in the agency zone. */
export const formatAgencyTimeRange = (startsAt: string, endsAt?: string): string => {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time not specified";
  return `${formatInTimeZone(start, AGENCY_TIME_ZONE, "h:mm a")} – ${formatInTimeZone(end, AGENCY_TIME_ZONE, "h:mm a zzz")}`;
};
