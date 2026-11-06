import { formatInTimeZone } from "date-fns-tz";
import { dateKey, parseDateKey, shiftDay, shiftMonth } from "@/lib/dateTimePicker";

/**
 * Date arithmetic for the agency and interpreter calendars. A day is the text "yyyy-MM-dd" and every step is done on
 * those calendar numbers in UTC (see lib/dateTimePicker), so no time zone or daylight-saving change can move a day and a
 * month step is clamped: one month before Oct 31 is Sep 30, never Sep 31 (which would roll over into October).
 */

export type CalendarView = "month" | "week" | "day";

/** The day one `unit` before (-1) or after (1) `key`. An unreadable key is returned unchanged. */
export const stepDateKey = (key: string, unit: CalendarView, direction: 1 | -1): string =>
  unit === "month" ? shiftMonth(key, direction) : shiftDay(key, unit === "week" ? 7 * direction : direction);

const weekday = (key: string): number => {
  const p = parseDateKey(key);
  return p ? new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() : 0;
};

/** The Sunday that starts the week containing `key`. */
export const weekStartKey = (key: string): string => shiftDay(key, -weekday(key));

/** The seven days (Sunday first) of the week containing `key`. */
export const weekKeys = (key: string): string[] => {
  const start = weekStartKey(key);
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
};

/** The month grid: the days of `key`'s month in Sunday-first rows, with null padding to a whole 5 or 6 weeks. */
export const monthCells = (key: string): (string | null)[] => {
  const p = parseDateKey(key);
  if (!p) return [];
  const first = dateKey(p.year, p.month, 1);
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: weekday(first) }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(dateKey(p.year, p.month, day));
  const total = cells.length > 35 ? 42 : 35;
  while (cells.length < total) cells.push(null);
  return cells;
};

/** Today in a given IANA zone (yyyy-MM-dd). */
export const zoneDateKey = (zone: string, nowMs: number = Date.now()): string => formatInTimeZone(nowMs, zone, "yyyy-MM-dd");

/** The key that identifies what is on screen: changes when the month, week or day changes, not when a day inside it is picked. */
export const rangeKeyFor = (key: string, view: CalendarView): string =>
  view === "month" ? key.slice(0, 7) : view === "week" ? weekStartKey(key) : key;

/** "11/06/2026" for the date badge. */
export const formatBadgeDate = (key: string): string => {
  const p = parseDateKey(key);
  return p ? `${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}/${String(p.year).padStart(4, "0")}` : "";
};
