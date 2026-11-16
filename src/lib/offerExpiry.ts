import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_OFFER_EXPIRY_HOURS = 24;
/** Longest response window staff can set (30 days); the server enforces the same limit. */
export const MAX_OFFER_EXPIRY_MINUTES = 30 * 24 * 60;

const MINUTE_MS = 60_000;

/** The text the offer form's "Hours" and "Minutes" inputs hold. */
export interface OfferExpiryFields {
  hours: string;
  minutes: string;
}

/** Kept free before the appointment when a short-notice window is filled in, so the deadline still falls before the start when the
 * form is sent a few minutes later (the server checks the same rule). */
export const SHORT_NOTICE_BUFFER_MINUTES = 10;

/**
 * The form's pre-filled response window: 24 hours, or, when the appointment starts sooner, the longest window that still ends
 * before it (SHORT_NOTICE_BUFFER_MINUTES ahead of the start), e.g. "5 h 50 min" for a job six hours away. Null only when the job
 * starts within that buffer, where no window can be offered.
 */
export function defaultOfferExpiry(now: Date, startsAt?: Date | null): OfferExpiryFields | null {
  const full: OfferExpiryFields = { hours: String(DEFAULT_OFFER_EXPIRY_HOURS), minutes: "0" };
  if (!startsAt || Number.isNaN(startsAt.getTime())) return full;
  if (offerExpiresAt(now, DEFAULT_OFFER_EXPIRY_HOURS * 60) < startsAt) return full;
  const total = Math.floor((startsAt.getTime() - now.getTime()) / MINUTE_MS) - SHORT_NOTICE_BUFFER_MINUTES;
  if (total < 1) return null;
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

/** The absolute deadline for an offer sent at `now` that must be answered within `totalMinutes`. */
export const offerExpiresAt = (now: Date, totalMinutes: number): Date => new Date(now.getTime() + totalMinutes * MINUTE_MS);

export type OfferExpiryCheck =
  | { ok: true; totalMinutes: number; expiresAt: Date; label: string }
  | { ok: false; message: string };

const WHOLE_NUMBER = /^\d+$/;

/**
 * Reads the Hours and Minutes inputs as a window from `now`, and checks it fits before the appointment starts.
 * A blank field counts as 0 as long as the other one is filled. `label` is the resulting deadline in the job's zone
 * (never the browser's), e.g. "Tue, Nov 3 · 2:15 PM PST".
 */
export function checkOfferExpiry(params: {
  hours: string;
  minutes: string;
  now: Date;
  timeZone: string;
  startsAt?: Date | null;
}): OfferExpiryCheck {
  const hours = params.hours.trim();
  const minutes = params.minutes.trim();
  if (!hours && !minutes) return { ok: false, message: "Enter how long the interpreter has to respond." };
  if ((hours && !WHOLE_NUMBER.test(hours)) || (minutes && !WHOLE_NUMBER.test(minutes))) {
    return { ok: false, message: "Use whole numbers for hours and minutes." };
  }
  const h = hours ? Number(hours) : 0;
  const m = minutes ? Number(minutes) : 0;
  if (m > 59) return { ok: false, message: "Minutes must be 59 or less. Use the hours box for longer windows." };
  const totalMinutes = h * 60 + m;
  if (totalMinutes < 1) return { ok: false, message: "The response window must be at least 1 minute." };
  if (totalMinutes > MAX_OFFER_EXPIRY_MINUTES) return { ok: false, message: "The response window can be at most 30 days." };

  const expiresAt = offerExpiresAt(params.now, totalMinutes);
  const { startsAt } = params;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && expiresAt >= startsAt) {
    const untilStart = Math.max(0, Math.floor((startsAt.getTime() - params.now.getTime()) / MINUTE_MS));
    return {
      ok: false,
      message: `The response window must end before the appointment starts (in ${Math.floor(untilStart / 60)} h ${untilStart % 60} min).`,
    };
  }
  return { ok: true, totalMinutes, expiresAt, label: formatInTimeZone(expiresAt, params.timeZone, "EEE, MMM d · h:mm a zzz") };
}
