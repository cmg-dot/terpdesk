import { cellText } from "@/lib/workbookImport/cells";
import type { Parsed } from "@/lib/workbookImport/cells";

/**
 * The Time Range column: one cell holding a shift such as "10-3", "9:30-12", "1-2:30", "10am-3pm" or "1000-1500".
 * Pure functions, no I/O.
 *
 * Excel turns a typed "10-3" into the date Oct 3. A Date arriving in this column is therefore converted back to text
 * from its month and day ("10-3") BEFORE the shift is read.
 */

export interface TimeRange {
  start: string;
  end: string;
  /** The range as text, after any date repair ("10-3"). */
  text: string;
}

const MINUTES_PER_DAY = 1440;
const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const shorten = (text: string): string => (text.length > 30 ? `${text.slice(0, 29)}…` : text);

/** What the cell says as text. A Date (Excel's "10-3" -> Oct 3) becomes "month-day" again; so does a stored date serial. */
export const timeRangeText = (value: unknown): string | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Excel dates arrive in UTC; the month and day are what the person typed.
    return `${value.getUTCMonth() + 1}-${value.getUTCDate()}`;
  }
  const text = cellText(value);
  if (text !== null && /^\d{5}(?:\.\d+)?$/.test(text)) {
    const date = new Date(Math.round((Number(text) - 25569) * 86_400_000));
    return Number.isNaN(date.getTime()) ? text : `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  }
  return text;
};

interface Token {
  hour: number;
  minute: number;
  meridiem: "a" | "p" | null;
}

/** Minutes after midnight for each reading of a token: one when it is explicit (am/pm or 24-hour), two when it is not. */
const candidates = (token: Token): number[] | null => {
  const { hour, minute, meridiem } = token;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return [((hour % 12) + (meridiem === "p" ? 12 : 0)) * 60 + minute];
  }
  if (hour > 23) return null;
  if (hour === 0 || hour > 12) return [hour * 60 + minute]; // can only be 24-hour
  return [(hour % 12) * 60 + minute, ((hour % 12) + 12) * 60 + minute]; // morning or afternoon
};

/** With no am/pm on either side, a start of 7 to 11 is the morning and 12 to 6 the afternoon (a working day). */
const guessStart = (options: number[]): number => {
  if (options.length === 1) return options[0];
  const hour = Math.floor(options[0] / 60) % 12 || 12;
  return hour >= 7 && hour <= 11 ? options[0] : options[1];
};

const TOKEN = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?`;
const RANGE = new RegExp(String.raw`^${TOKEN}\s*(?:-|–|—|\bto\b|\buntil\b)\s*${TOKEN}\s*(?:\(.*\))?$`, "i");
const MILITARY = /^(\d{2})(\d{2})\s*(?:-|–|—)\s*(\d{2})(\d{2})$/;

const token = (hour: string, minute: string | undefined, mer: string | undefined): Token => ({
  hour: Number(hour),
  minute: minute === undefined ? 0 : Number(minute),
  meridiem: mer ? (mer.toLowerCase() as "a" | "p") : null,
});

/**
 * Reads a shift as a start and an end ("HH:mm", 24-hour, same day). The end is always the first time after the start, so
 * "10-3" is 10:00 to 15:00, "1-2:30" is 13:00 to 14:30 and "9-12" is 09:00 to 12:00. Anything that isn't a shift, or
 * ends before it starts, is refused with a message.
 */
export const parseTimeRange = (value: unknown): Parsed<TimeRange> => {
  const text = timeRangeText(value);
  if (text === null) return { value: null };
  const fail = (): Parsed<TimeRange> => ({ value: null, problem: `"${shorten(text)}" is not a time range like 10-3 or 9:30-12` });

  const military = MILITARY.exec(text);
  const match = military ? null : RANGE.exec(text);
  if (!military && !match) return fail();

  const first: Token = military ? { hour: Number(military[1]), minute: Number(military[2]), meridiem: null } : token(match![1], match![2], match![3]);
  const second: Token = military ? { hour: Number(military[3]), minute: Number(military[4]), meridiem: null } : token(match![4], match![5], match![6]);
  const startOptions = candidates(first);
  const endOptions = candidates(second);
  if (!startOptions || !endOptions) return fail();

  let start: number;
  if (endOptions.length === 1 && startOptions.length === 2) {
    // "10-3pm": the start is the reading just before the end.
    const before = startOptions.filter((m) => m < endOptions[0]);
    if (before.length === 0) return { value: null, problem: `"${shorten(text)}" ends before it starts` };
    start = Math.max(...before);
  } else {
    start = guessStart(startOptions);
  }
  const after = endOptions.filter((m) => m > start);
  if (after.length === 0) return { value: null, problem: `"${shorten(text)}" ends before it starts` };
  const end = Math.min(...after);
  if (start < 0 || end >= MINUTES_PER_DAY) return fail();

  return { value: { start: hhmm(start), end: hhmm(end), text } };
};
