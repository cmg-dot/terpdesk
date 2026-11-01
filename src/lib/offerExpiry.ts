import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_OFFER_EXPIRY_HOURS = 24;

/** The text the offer form's date and time inputs hold ("2026-11-02" and "14:30"). */
export interface OfferExpiryFields {
  date: string;
  time: string;
}

/**
 * The form's pre-filled response deadline: exactly 24 hours after `now`, written in the appointment's time zone (the
 * zone the inputs are read in). Null when that moment would not be before the appointment starts, since the server
 * refuses such a deadline; staff then pick one themselves instead of being handed a value that can't be used.
 */
export function defaultOfferExpiry(now: Date, timeZone: string, startsAt?: Date | null): OfferExpiryFields | null {
  const expiresAt = new Date(now.getTime() + DEFAULT_OFFER_EXPIRY_HOURS * 60 * 60 * 1000);
  if (startsAt && !Number.isNaN(startsAt.getTime()) && expiresAt >= startsAt) return null;
  return {
    date: formatInTimeZone(expiresAt, timeZone, "yyyy-MM-dd"),
    time: formatInTimeZone(expiresAt, timeZone, "HH:mm"),
  };
}
