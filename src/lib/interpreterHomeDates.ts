import { formatInTimeZone } from "date-fns-tz";

/**
 * Date text for the interpreter Home's cards (moved out of the page unchanged). Pure.
 */

export const parseSafeDate = (dateVal?: string): Date | null => {
  if (!dateVal) return null;
  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;
  if (typeof dateVal === "string") {
    d = new Date(dateVal.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d;
    if (/^\d+$/.test(dateVal)) {
      d = new Date(parseInt(dateVal, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
};

export const homeIanaZone = (tz?: string): string => {
  if (!tz || typeof tz !== "string") return "America/Los_Angeles";
  const lower = tz.toLowerCase();
  if (lower.includes("hawaii")) return "Pacific/Honolulu";
  if (lower.includes("alaska")) return "America/Anchorage";
  if (lower.includes("pacific")) return "America/Los_Angeles";
  if (lower.includes("arizona")) return "America/Phoenix";
  if (lower.includes("mountain")) return "America/Denver";
  if (lower.includes("central")) return "America/Chicago";
  if (lower.includes("eastern")) return "America/New_York";
  return "America/Los_Angeles";
};

/** "TUE, DEC 1 · 8:45 AM – 9:45 AM PST" in the interpreter's own zone (the profile's zone wins over the job's). */
export const formatHomeJobDate = (profileTimezone: string, startStr?: string, endStr?: string, timeZone?: string): string => {
  if (!startStr) return "Date TBD";
  try {
    const start = parseSafeDate(startStr);
    if (!start) return "Date TBD";
    const safeZone = homeIanaZone(profileTimezone || timeZone);
    const end = parseSafeDate(endStr);
    const dateStr = formatInTimeZone(start, safeZone, "EEE, MMM d").toUpperCase();
    const timeStart = formatInTimeZone(start, safeZone, "h:mm a");
    const timeEnd = end ? formatInTimeZone(end, safeZone, "h:mm a zzz") : formatInTimeZone(start, safeZone, "h:mm a zzz");
    return `${dateStr} · ${timeStart} – ${timeEnd}`;
  } catch {
    return "Date TBD";
  }
};
