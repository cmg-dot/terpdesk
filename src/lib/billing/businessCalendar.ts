import { addDays, isoWeekday, overlapMinutes, wallInstant, zonedDate } from "@/lib/billing/calendarDays";
import type { BillingSettings, JobOutcome } from "@/lib/billing/types";

/**
 * Business time for the cancellation rule: Monday to Friday, 8:00 AM to 5:00 PM Pacific (the agency's settings), holidays excluded.
 * Counted on the wall clock, so a daylight-saving change never shifts the day. Not the same clock as lib/businessHours.ts, which
 * times the hours-submission deadline (whole weekdays, no holidays) and is left as it is. Pure.
 */

export const BUSINESS_ZONE = "America/Los_Angeles";

export interface BusinessCalendar {
  zone: string;
  dayStartMinute: number;
  dayEndMinute: number;
  /** yyyy-MM-dd holidays. */
  holidays: ReadonlySet<string>;
}

export const calendarFrom = (settings: Pick<BillingSettings, "businessDayStartMinute" | "businessDayEndMinute">, holidays: Iterable<string>): BusinessCalendar => ({
  zone: BUSINESS_ZONE,
  dayStartMinute: settings.businessDayStartMinute,
  dayEndMinute: settings.businessDayEndMinute,
  holidays: new Set(holidays),
});

export const isBusinessDay = (date: string, calendar: BusinessCalendar): boolean => isoWeekday(date) <= 5 && !calendar.holidays.has(date);

/** Minutes in one business day (540 for 8 to 5). */
export const businessDayMinutes = (calendar: BusinessCalendar): number => calendar.dayEndMinute - calendar.dayStartMinute;

/**
 * Business minutes from `from` to `to` (0 when `to` is not after `from`). `cap` stops counting once reached, so a cancellation made
 * months ahead does not walk every day in between.
 */
export function businessMinutesBetween(from: Date, to: Date, calendar: BusinessCalendar, cap = Number.POSITIVE_INFINITY): number {
  const a = from.getTime();
  const b = to.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const lastDay = zonedDate(to, calendar.zone);
  let total = 0;
  // Bounded: about ten years of days at most, whatever the input.
  for (let day = zonedDate(from, calendar.zone), guard = 0; day <= lastDay && guard < 3700; day = addDays(day, 1), guard += 1) {
    if (!isBusinessDay(day, calendar)) continue;
    const open = wallInstant(day, calendar.dayStartMinute, calendar.zone).getTime();
    const close = wallInstant(day, calendar.dayEndMinute, calendar.zone).getTime();
    total += overlapMinutes(a, b, open, close);
    if (total >= cap) return total;
  }
  return Math.round(total * 100) / 100;
}

export interface CancellationJudgement {
  suggested: Exclude<JobOutcome, "completed">;
  noticeBusinessMinutes: number;
}

/**
 * Billable when the cancellation came with less than `noticeBusinessDays` business days of notice (2 days = 18 business hours for
 * 8 to 5). A cancellation after the start has no notice at all.
 */
export function judgeCancellation(cancelledAt: Date, startsAt: Date, calendar: BusinessCalendar, noticeBusinessDays: number): CancellationJudgement {
  const threshold = noticeBusinessDays * businessDayMinutes(calendar);
  const notice = businessMinutesBetween(cancelledAt, startsAt, calendar, threshold);
  return { suggested: notice < threshold ? "cancelled_billable" : "cancelled_not_billable", noticeBusinessMinutes: Math.min(notice, threshold) };
}
