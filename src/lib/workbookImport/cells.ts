import { z } from "zod";

/**
 * Turns raw spreadsheet cells into clean values. A cell that can't be understood becomes `value: null` plus a
 * `problem`, never an exception: one bad cell must not stop the rest of that person (or anyone else) importing.
 * Pure functions, no I/O.
 */

export interface Parsed<T> {
  value: T | null;
  problem?: string;
}

/** Cells people type instead of leaving a field empty. */
const BLANK_MARKERS = /^(?:-+|n\/?a|none|nil|tbd|unknown|pending)$/i;
const emailSchema = z.string().email().max(254);
const MAX_RATE = 99_999.99;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

const shorten = (text: string, max = 40): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Trimmed text with control characters and runs of spaces collapsed; null when empty (or when the cell is a date). */
export const cellText = (value: unknown): string | null => {
  if (value === null || value === undefined || value instanceof Date) return null;
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
};

/** The case-insensitive key two sheets are joined on. Whitespace differences never split one person in two. */
export const nameKey = (name: string): string => name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const RATE = /^\$?\s*(\d{1,5}(?:\.\d+)?)\s*(?:\/\s*h(?:ou)?r|per\s*hour|hr)?$/i;

/** An hourly rate as "58.00". Accepts 58, 58.5, "$58", "58/hr", "1,058.25". */
export const parseRate = (value: unknown): Parsed<string> => {
  if (value instanceof Date) return { value: null, problem: "is a date, not an amount" };
  const text = cellText(value);
  if (text === null || BLANK_MARKERS.test(text)) return { value: null };
  const match = RATE.exec(text.replace(/,/g, ""));
  if (!match) return { value: null, problem: `"${shorten(text)}" is not an amount` };
  const amount = Number(match[1]);
  // Formula results such as 58.50000000000001 are float noise; a real third decimal is a mistake worth flagging.
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) return { value: null, problem: `"${shorten(text)}" has more than 2 decimals` };
  if (amount > MAX_RATE) return { value: null, problem: `"${shorten(text)}" is too large` };
  return { value: amount.toFixed(2) };
};

const isoDate = (year: number, month: number, day: number): string | null => {
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
};

const fromUtc = (date: Date): string | null => (Number.isNaN(date.getTime()) ? null : isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));

/** A calendar date as "yyyy-MM-dd". Accepts date cells, yyyy-MM-dd, US-style m/d/yyyy (or m/d/yy) and Excel serial numbers. */
export const parseDateCell = (value: unknown): Parsed<string> => {
  if (value instanceof Date) {
    const iso = fromUtc(value);
    return iso ? { value: iso } : { value: null, problem: "is not a valid date" };
  }
  const text = cellText(value);
  if (text === null || BLANK_MARKERS.test(text)) return { value: null };

  let iso: string | null = null;
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  const mdy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (ymd) iso = isoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  else if (mdy) iso = isoDate(mdy[3].length === 2 ? 2000 + Number(mdy[3]) : Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  else if (/^\d{5}(?:\.\d+)?$/.test(text)) iso = fromUtc(new Date(Math.round((Number(text) - 25569) * 86_400_000)));

  return iso ? { value: iso } : { value: null, problem: `"${shorten(text)}" is not a date` };
};

/** The first valid email in the cell (a cell may list several), lowercased. */
export const parseEmailCell = (value: unknown): Parsed<string> => {
  const text = cellText(value);
  if (text === null || BLANK_MARKERS.test(text)) return { value: null };
  const candidates = text.replace(/mailto:/gi, "").split(/[\s,;<>()]+/).filter(Boolean);
  const found = candidates.find((candidate) => emailSchema.safeParse(candidate).success);
  return found ? { value: found.toLowerCase() } : { value: null, problem: `"${shorten(text)}" is not an email address` };
};
