import { addDays, overlapMinutes, wallInstant, zonedDate } from "@/lib/billing/calendarDays";
import type { TimeWindow } from "@/lib/billing/types";

/**
 * The evening part of travel time. Travel minutes that fall in the agency's evening window (e.g. 6:00 PM to 6:00 AM, which wraps
 * past midnight) are paid at the interpreter's evening rate when both the window and that rate are set; the rest at the job's rate.
 * Counted on the job's own wall clock. Pure.
 */

/** Minutes of `window` inside the evening window [startMinute, endMinute) on every day it touches. */
export function eveningMinutesIn(window: TimeWindow, zone: string, startMinute: number, endMinute: number): number {
  const a = Date.parse(window.start);
  const b = Date.parse(window.end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || startMinute === endMinute) return 0;
  const wraps = endMinute < startMinute;
  const lastDay = zonedDate(window.end, zone);
  let total = 0;
  // From the day before: a wrapping window that began the previous evening covers this morning.
  for (let day = addDays(zonedDate(window.start, zone), -1), guard = 0; day <= lastDay && guard < 400; day = addDays(day, 1), guard += 1) {
    const open = wallInstant(day, startMinute, zone).getTime();
    const close = wallInstant(day, wraps ? endMinute + 1440 : endMinute, zone).getTime();
    total += overlapMinutes(a, b, open, close);
  }
  return Math.round(total);
}

export interface TravelSplit {
  dayMinutes: number;
  eveningMinutes: number;
}

/**
 * Splits the approved travel minutes. When staff approved less (or more) than the submitted window, the evening share keeps the
 * window's proportion. No window, no evening window or no evening rate: it is all day travel.
 */
export function splitTravel(
  approvedMinutes: number,
  window: TimeWindow | null,
  zone: string,
  evening: { startMinute: number | null; endMinute: number | null; rateSet: boolean },
): TravelSplit {
  const total = Math.max(0, Math.round(approvedMinutes));
  if (total === 0 || !window || evening.startMinute === null || evening.endMinute === null || !evening.rateSet) return { dayMinutes: total, eveningMinutes: 0 };
  const windowMinutes = (Date.parse(window.end) - Date.parse(window.start)) / 60000;
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return { dayMinutes: total, eveningMinutes: 0 };
  const inEvening = eveningMinutesIn(window, zone, evening.startMinute, evening.endMinute);
  const eveningMinutes = Math.min(total, Math.round((total * inEvening) / windowMinutes));
  return { dayMinutes: total - eveningMinutes, eveningMinutes };
}
