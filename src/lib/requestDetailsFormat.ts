import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone, parseInstantInZone } from "@/utils/timezone";

/** A date from whatever a stored request holds (ISO text, "yyyy-MM-dd HH:mm", epoch milliseconds as text, a Date), or null. */
export const parseSafeDate = (value: unknown): Date | null => {
  if (!value) return null;
  const direct = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (direct && !Number.isNaN(direct.getTime())) return direct;
  if (typeof value === "string") {
    const spaced = new Date(value.replace(" ", "T"));
    if (!Number.isNaN(spaced.getTime())) return spaced;
    if (/^\d+$/.test(value)) {
      const epoch = new Date(parseInt(value, 10));
      if (!Number.isNaN(epoch.getTime())) return epoch;
    }
  }
  return null;
};

export const mapSafeZone = (zone?: string): string => getIanaZone(zone);

/** "Tue, Sep 22 · 10:53 AM – 12:53 PM PDT" in the appointment's own zone, or "Date TBD". */
export const formatDetailsDate = (start?: string | Date | null, end?: string | Date | null, timeZone?: string): string => {
  try {
    if (!start) return "Date TBD";
    const zone = getIanaZone(timeZone);
    const from = parseInstantInZone(start, zone);
    if (!from) return "Date TBD";

    const day = formatInTimeZone(from, zone, "EEE, MMM d");
    const startTime = formatInTimeZone(from, zone, "h:mm a");
    const to = end ? parseInstantInZone(end, zone) : null;
    const endTime = to ? formatInTimeZone(to, zone, "h:mm a zzz") : formatInTimeZone(from, zone, "h:mm a zzz");
    return `${day} · ${startTime} – ${endTime}`;
  } catch {
    return "Date TBD";
  }
};
