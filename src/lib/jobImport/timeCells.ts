import { fromZonedTime } from "date-fns-tz";

/** A local date ("yyyy-MM-dd") and time ("HH:mm") in an IANA zone, as a strict UTC ISO timestamp; null if impossible. */
export const toUtcIsoInZone = (date: string, time: string, zone: string): string | null => {
  try {
    const instant = fromZonedTime(`${date}T${time}:00`, zone);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  } catch {
    return null;
  }
};
