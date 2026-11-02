import { fromZonedTime } from "date-fns-tz";
import { cellText } from "@/lib/workbookImport/cells";
import type { Parsed } from "@/lib/workbookImport/cells";

/** Time-of-day cells and the conversion to a strict UTC timestamp. Pure functions, no I/O. */

const MINUTES_PER_DAY = 1440;

const shorten = (text: string): string => (text.length > 30 ? `${text.slice(0, 29)}…` : text);
const hhmm = (minutes: number): string => {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * A time of day as "HH:mm" (24-hour). Accepts time cells, "9:30", "9:30 AM", "9:30:00 pm", "3pm", "0930", and Excel's
 * stored fraction of a day (0.375 = 9:00). A bare whole number such as "9" is refused: it could be anything.
 */
export const parseTimeCell = (value: unknown): Parsed<string> => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { value: null, problem: "is not a valid time" };
    // Excel time cells arrive as a date on 1899-12-30 in UTC; only the time of day matters. Rounded to the minute so
    // floating point (09:59:59.999) never lands on the wrong minute.
    return { value: hhmm(((value.getTime() % 86_400_000) + 86_400_000) % 86_400_000 / 60_000) };
  }
  const text = cellText(value);
  if (text === null) return { value: null };

  const clock = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m?\.?$|^(\d{1,2}):(\d{2})(?::\d{2})?$/i.exec(text);
  const hourOnly = /^(\d{1,2})\s*([ap])\.?m?\.?$/i.exec(text);
  const military = /^(\d{2})(\d{2})$/.exec(text);

  let hour: number | null = null;
  let minute = 0;
  let meridiem: string | null = null;
  if (clock) {
    hour = Number(clock[1] ?? clock[4]);
    minute = Number(clock[2] ?? clock[5]);
    meridiem = clock[3] ?? null;
  } else if (hourOnly) {
    hour = Number(hourOnly[1]);
    meridiem = hourOnly[2];
  } else if (military) {
    hour = Number(military[1]);
    minute = Number(military[2]);
  } else if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const fraction = serial - Math.floor(serial);
    if (fraction > 0 || serial === 0) return { value: hhmm(fraction * MINUTES_PER_DAY) };
  }

  if (hour === null || minute > 59) return { value: null, problem: `"${shorten(text)}" is not a time` };
  if (meridiem) {
    if (hour < 1 || hour > 12) return { value: null, problem: `"${shorten(text)}" is not a time` };
    hour = (hour % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);
  }
  if (hour > 23) return { value: null, problem: `"${shorten(text)}" is not a time` };
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
};

/** A local date ("yyyy-MM-dd") and time ("HH:mm") in an IANA zone, as a strict UTC ISO timestamp; null if impossible. */
export const toUtcIsoInZone = (date: string, time: string, zone: string): string | null => {
  try {
    const instant = fromZonedTime(`${date}T${time}:00`, zone);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  } catch {
    return null;
  }
};
