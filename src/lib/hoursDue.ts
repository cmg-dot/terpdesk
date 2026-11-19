import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_ZONE, HOURS_SLA_BUSINESS_HOURS, addBusinessHours, hoursSlaStart } from "@/lib/businessHours";

/**
 * When an interpreter's hours (or, on a state job, the ODHH Verification Form) are due: 48 business hours after the appointment ends
 * (Monday to Friday, Pacific; see businessHours.ts). The same rule the overdue banner and the daily reminder use, so what an
 * interpreter reads on a card before the deadline is what the banner enforces after it. Pure.
 */

/** The instant the deadline falls: `endsAt` plus 48 business hours. Null when `endsAt` is not a usable time. */
export function hoursDueAt(endsAt: Date | string | number): Date | null {
  const end = new Date(endsAt);
  return Number.isNaN(end.getTime()) ? null : addBusinessHours(end, HOURS_SLA_BUSINESS_HOURS);
}

export interface HoursDue {
  dueAt: Date;
  /** "Thu, Nov 20, 5:00 PM PST" on the agency's clock. */
  when: string;
  /** The deadline has passed (the overdue banner lists it). */
  overdue: boolean;
}

/** The deadline to show for an appointment, or null when it has no end time or ended before the rule began (older jobs are never flagged). */
export function hoursDueInfo(endsAt: Date | string | number | null | undefined, nowMs: number = Date.now()): HoursDue | null {
  if (endsAt === null || endsAt === undefined || endsAt === "") return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime()) || end < hoursSlaStart()) return null;
  const dueAt = hoursDueAt(end);
  if (!dueAt) return null;
  return { dueAt, when: formatInTimeZone(dueAt, BUSINESS_ZONE, "EEE, MMM d, h:mm a zzz"), overdue: nowMs >= dueAt.getTime() };
}
