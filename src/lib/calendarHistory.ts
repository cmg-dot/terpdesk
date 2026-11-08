import { stepDateKey, weekKeys } from "@/lib/calendarNav";
import type { CalendarView } from "@/lib/calendarNav";

/**
 * The first day the agency has appointments on file. The calendar loads everything there is, so before this day it is
 * simply empty; the page says so instead of looking broken. Pure.
 */
export const HISTORY_STARTS_KEY = "2026-10-10";
export const HISTORY_NOTICE = "No appointments on file prior to Oct 10, 2026.";

/** True when everything the view shows (the month, the week or the day around `dateKey`) is before the first day on file. */
export function rangeBeforeHistory(dateKey: string, view: CalendarView): boolean {
  if (view === "day") return dateKey < HISTORY_STARTS_KEY;
  if (view === "week") return weekKeys(dateKey)[6] < HISTORY_STARTS_KEY;
  // The month ends the day before the next month starts.
  return stepDateKey(`${dateKey.slice(0, 7)}-01`, "month", 1) <= HISTORY_STARTS_KEY;
}
