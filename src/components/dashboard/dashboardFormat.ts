import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone } from "@/utils/timezone";

/** A date from whatever a stored time looks like (an ISO string, "2026-11-10 09:00", epoch milliseconds), or null. */
export const parseSafeDate = (value: unknown): Date | null => {
  if (!value) return null;
  let d = new Date(value as string | number);
  if (!isNaN(d.getTime())) return d;
  if (typeof value === "string") {
    d = new Date(value.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d;
    if (/^\d+$/.test(value)) {
      d = new Date(parseInt(value, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

/** "Tue, Nov 10 · 9:00 AM – 10:00 AM PST", in the job's own zone. */
export const formatEventTime = (startsAt?: string, endsAt?: string, timeZone?: string): string => {
  if (!startsAt) return "Time not specified";
  try {
    const start = parseSafeDate(startsAt);
    if (!start) return "Time not specified";
    const safeZone = getIanaZone(timeZone);
    const end = parseSafeDate(endsAt);
    const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d");
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    const timeEnd = end ? formatInTimeZone(end, safeZone, "h:mm a zzz") : formatInTimeZone(start, safeZone, "h:mm a zzz");
    return `${dateStr} · ${timeStart} – ${timeEnd}`;
  } catch {
    return "Time not specified";
  }
};

/** The same line for an upcoming-booking card: the date in capitals, "Date TBD" when there is none. */
export const formatBookingDateLine = (startsAt?: string, endsAt?: string, timeZone?: string): string => {
  try {
    const s = parseSafeDate(startsAt);
    if (!s) return "Date TBD";
    const safeZone = getIanaZone(timeZone);
    const e = parseSafeDate(endsAt);
    const dateStr = formatInTimeZone(s, safeZone, "EEE, MMM d").toUpperCase();
    const timeStart = formatInTimeZone(s, safeZone, "h:mm a");
    const timeEnd = e ? formatInTimeZone(e, safeZone, "h:mm a zzz") : formatInTimeZone(s, safeZone, "h:mm a zzz");
    return `${dateStr} · ${timeStart} – ${timeEnd}`;
  } catch {
    return "Date TBD";
  }
};

/** The status as an upcoming-booking badge reads it. */
export const formatStatusBadge = (status: string): string => {
  if (!status) return "Assigned";
  const s = status.trim().toLowerCase();
  if (s === "booked") return "Booked";
  if (s === "assigned") return "Assigned";
  if (s.includes("partially")) return "Partially staffed";
  if (s.includes("fully")) return "Fully staffed";
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};
