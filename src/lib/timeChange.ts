import { formatInTimeZone } from "date-fns-tz";
import type { ActivityChange } from "@/db/schema";
import { resolveRequestTimes } from "@/utils/timezone";
import type { Instants } from "@/lib/editTimes";

/**
 * A change to a job's start or end, worked out from the stored UTC instants (never from on-screen text), and how it is
 * written in the activity log: always in the agency's zone, America/Los_Angeles. Pure.
 */

export const AGENCY_LOG_ZONE = "America/Los_Angeles";

export interface TimeChange {
  before: Instants;
  after: Instants;
}

const minute = (value: string): number => Math.floor(Date.parse(value) / 60000);

/** The change between the job's current times and the times about to be saved; null when neither moved (to the minute). */
export function timeChangeOf(existing: { createdAt?: Date | string | null; data?: unknown }, after: Instants): TimeChange | null {
  const before = resolveRequestTimes(existing);
  const moved = minute(before.startsAt) !== minute(after.startsAt) || minute(before.endsAt) !== minute(after.endsAt);
  return moved ? { before, after } : null;
}

const day = (iso: string): string => formatInTimeZone(iso, AGENCY_LOG_ZONE, "EEE, MMM d, yyyy");
const clock = (iso: string): string => formatInTimeZone(iso, AGENCY_LOG_ZONE, "h:mm a");
const full = (iso: string): string => `${day(iso)} ${formatInTimeZone(iso, AGENCY_LOG_ZONE, "h:mm a zzz")}`;

/** "Fri, Nov 13, 2026 7:30 AM – 8:30 AM PST" (the end shows its own day when it is not the start's). */
export function describeRange(range: Instants): string {
  return day(range.startsAt) === day(range.endsAt)
    ? `${day(range.startsAt)} ${clock(range.startsAt)} – ${formatInTimeZone(range.endsAt, AGENCY_LOG_ZONE, "h:mm a zzz")}`
    : `${full(range.startsAt)} – ${full(range.endsAt)}`;
}

export const timeChangeMessage = (change: TimeChange): string => `Time changed from ${describeRange(change.before)} to ${describeRange(change.after)} (Pacific Time)`;

/** One entry per moved end: the old and new start and/or end, each with its date and zone. */
export function timeChangeFields(change: TimeChange): ActivityChange[] {
  const fields: ActivityChange[] = [];
  if (minute(change.before.startsAt) !== minute(change.after.startsAt)) fields.push({ field: "Start", from: full(change.before.startsAt), to: full(change.after.startsAt) });
  if (minute(change.before.endsAt) !== minute(change.after.endsAt)) fields.push({ field: "End", from: full(change.before.endsAt), to: full(change.after.endsAt) });
  return fields;
}

/** The security-audit line: identifiers and ISO instants only, no client details. */
export const timeChangeAuditDetails = (requestId: string, srn: string | null, change: TimeChange): string =>
  `requestId=${requestId}; srn=${srn ?? "none"}; oldStart=${change.before.startsAt}; oldEnd=${change.before.endsAt}; newStart=${change.after.startsAt}; newEnd=${change.after.endsAt}`;
