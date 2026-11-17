import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone } from "@/utils/timezone";

/**
 * An offer's response deadline (offers.expires_at) as people read it, and how long its email link lasts. Interpreters see
 * "Respond by <label>", staff "Response due <label>". Pure.
 */

/** Shortest and longest life of an offer's email link. The longest matches the longest response window staff can set. */
const MIN_LINK_SECONDS = 60 * 60;
const MAX_LINK_SECONDS = 30 * 24 * 60 * 60;

const asDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "Tue, Nov 25 · 3:00 PM PST" in the job's zone; null when there is no usable deadline. */
export function offerDeadlineLabel(expiresAt: string | Date | null | undefined, timeZone: string | undefined): string | null {
  const date = asDate(expiresAt);
  return date ? formatInTimeZone(date, getIanaZone(timeZone), "EEE, MMM d · h:mm a zzz") : null;
}

/**
 * Seconds an offer's Accept / Decline link stays valid: until the offer's deadline, at least an hour (so a link sent close to the
 * deadline still opens and explains the offer has closed) and at most 30 days. 48 hours when the deadline is unknown.
 */
export function offerLinkLifetimeSeconds(expiresAt: string | Date | null | undefined, now: Date = new Date()): number {
  const date = asDate(expiresAt);
  if (!date) return 48 * 60 * 60;
  const seconds = Math.ceil((date.getTime() - now.getTime()) / 1000);
  return Math.min(MAX_LINK_SECONDS, Math.max(MIN_LINK_SECONDS, seconds));
}
