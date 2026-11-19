import { fromZonedTime } from "date-fns-tz";
import type { ParsedIntakeEmail } from "@/lib/odhhEmailParser";
import { normalizeEmailText } from "@/lib/odhhEmailText";

/**
 * A state request email's appointment as two instants, from its own Pacific wall-clock date and times. Pure, no I/O. Kept apart from
 * odhhEmailParser.ts (which re-exports it).
 */

// ODHH is a Washington State agency — appointment times are Pacific.
export const ODHH_TIME_ZONE_IANA = "America/Los_Angeles";

/** The warning saved on a job whose end time is earlier in the day than its start: the appointment runs past midnight. */
export const ENDS_NEXT_DAY_WARNING = "Ends next day";
/** The longest appointment read as running past midnight. An end that would make it longer is a typo, not an overnight job. */
export const MAX_OVERNIGHT_HOURS = 16;

/**
 * A job email must carry at least one of these labels. A conversational reply ("RE: email update") has none, so it is
 * never turned into a calendar event.
 */
export const JOB_ANCHOR_PATTERNS: readonly RegExp[] = [
  /^[ \t]*Appointment[ \t]*:/im,
  /^[ \t]*Appointment[ \t]+Date[ \t]*:/im,
  /^[ \t]*HCA[ \t]+Reference[ \t]+Number[ \t]*:/im,
  /^[ \t]*BOOKING[ \t]+Appointment[ \t]+Date[ \t]+and[ \t]+Time[ \t]*:/im,
];

export const hasJobAnchor = (text: string): boolean => JOB_ANCHOR_PATTERNS.some((pattern) => pattern.test(text));

/** The calendar day after a yyyy-MM-dd date. */
export const nextIsoDay = (isoDate: string): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

type ScheduleFields = Pick<ParsedIntakeEmail, "isoDate" | "start24" | "end24">;

/**
 * The appointment's start and end, read ONLY from the email's own Pacific wall-clock date and times (the instant is held
 * as a Date; the zone is always America/Los_Angeles, DST included). Nothing is guessed: no arrival time, no `new Date()`,
 * no "one hour after the start". Both are null unless date, start and end are all present.
 *
 * An end earlier in the day than the start ("9:45 PM" to "1:00 AM") is the next morning, when that makes the appointment
 * MAX_OVERNIGHT_HOURS or shorter; the job then carries the ENDS_NEXT_DAY_WARNING. The same start and end ("1:00 AM" to "1:00 AM")
 * is a typo and is still refused, as is an end that would make it longer.
 */
export function appointmentTimes(parsed: ScheduleFields, warnings: string[]): { startsAt: Date | null; endsAt: Date | null } {
  if (!parsed.isoDate || !parsed.start24 || !parsed.end24) return { startsAt: null, endsAt: null };
  const startsAt = fromZonedTime(`${parsed.isoDate}T${parsed.start24}:00`, ODHH_TIME_ZONE_IANA);
  const sameDayEnd = fromZonedTime(`${parsed.isoDate}T${parsed.end24}:00`, ODHH_TIME_ZONE_IANA);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(sameDayEnd.getTime())) {
    warnings.push("Could not compute appointment timestamps");
    return { startsAt: null, endsAt: null };
  }
  if (sameDayEnd > startsAt) return { startsAt, endsAt: sameDayEnd };
  if (parsed.start24 !== parsed.end24) {
    const endsAt = fromZonedTime(`${nextIsoDay(parsed.isoDate)}T${parsed.end24}:00`, ODHH_TIME_ZONE_IANA);
    const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
    if (hours > 0 && hours <= MAX_OVERNIGHT_HOURS) {
      warnings.push(ENDS_NEXT_DAY_WARNING);
      return { startsAt, endsAt };
    }
  }
  warnings.push("End time is not after start time");
  return { startsAt: null, endsAt: null };
}

/**
 * The only way a draft job gets a schedule. Null means "not a job we can place on the calendar": the email has none of
 * the core anchors, or its date/time could not be read. The caller must then create nothing (the email stays in the Inbox).
 */
export function jobSchedule(rawContent: string, parsed: ScheduleFields, warnings: string[]): { startsAt: Date; endsAt: Date } | null {
  if (!hasJobAnchor(normalizeEmailText(rawContent))) {
    warnings.push("No appointment anchor found");
    return null;
  }
  const { startsAt, endsAt } = appointmentTimes(parsed, warnings);
  if (!startsAt || !endsAt) {
    warnings.push("Appointment date and times could not be read");
    return null;
  }
  return { startsAt, endsAt };
}
