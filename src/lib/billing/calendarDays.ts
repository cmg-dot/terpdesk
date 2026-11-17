import { formatInTimeZone } from "date-fns-tz";
import { wallClockToUtc } from "@/utils/timezone";

/** Calendar-day arithmetic on plain yyyy-MM-dd dates (no time zone involved), plus the step to and from a zone's wall clock. Pure. */

const pad = (n: number): string => String(n).padStart(2, "0");

export const isoDate = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** yyyy-MM-dd plus `days`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** The last day of a month (1-12). */
export const lastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The instant `minute` minutes after midnight on `date` on the zone's wall clock (1440 = the next midnight). */
export function wallInstant(date: string, minute: number, zone: string): Date {
  const day = minute >= 1440 ? addDays(date, Math.floor(minute / 1440)) : date;
  const m = minute % 1440;
  return new Date(wallClockToUtc(`${day}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`, zone));
}

/** The zone's calendar date of an instant. */
export const zonedDate = (at: Date | string, zone: string): string => formatInTimeZone(at, zone, "yyyy-MM-dd");

/** Minutes two intervals share (0 when they do not meet). */
export const overlapMinutes = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / 60000;
