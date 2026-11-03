/**
 * Pure date and time helpers for the pickers (components/ui/CalendarGrid.tsx, TimeSelector.tsx). A date is the text
 * "yyyy-MM-dd" and a time is "HH:mm" (24 hour), exactly what a native date / time input holds, so a form's state does not
 * change. All date arithmetic is done in UTC on the calendar numbers themselves, so no time zone or daylight-saving change
 * can move a day.
 */

const DAY_MS = 86_400_000;
const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export interface DateParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

export const dateKey = (year: number, month: number, day: number): string => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** The parts of a real calendar date written yyyy-MM-dd, or null (also for dates that do not exist, like 2026-02-30). */
export const parseDateKey = (value: string): DateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
};

const fromMs = (ms: number): DateParts => {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

/** Today on this device's clock, as a date key. */
export const todayKey = (now: Date = new Date()): string => dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

/** The date key `days` days after (or before, when negative) `key`. An unreadable key is returned unchanged. */
export const shiftDay = (key: string, days: number): string => {
  const p = parseDateKey(key);
  if (!p) return key;
  const next = fromMs(Date.UTC(p.year, p.month - 1, p.day) + days * DAY_MS);
  return dateKey(next.year, next.month, next.day);
};

/** `key` moved by whole months, the day kept where possible and otherwise pulled back to the end of the shorter month. */
export const shiftMonth = (key: string, months: number): string => {
  const p = parseDateKey(key);
  if (!p) return key;
  const index = p.year * 12 + (p.month - 1) + months;
  const [year, month] = [Math.floor(index / 12), (index % 12) + 1];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return dateKey(year, month, Math.min(p.day, lastDay));
};

export interface DayCell {
  key: string;
  day: number;
  /** False for the greyed days of the previous / next month that fill out the first and last week. */
  inMonth: boolean;
}

/** Six weeks (42 days, Sunday first) that contain the given month, so the grid never changes height. */
export const monthGrid = (year: number, month: number): DayCell[] => {
  const first = Date.UTC(year, month - 1, 1);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => {
    const p = fromMs(start + i * DAY_MS);
    return { key: dateKey(p.year, p.month, p.day), day: p.day, inMonth: p.year === year && p.month === month };
  });
};

const dateFormat = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });

/** "November 2026". */
export const monthLabel = (year: number, month: number): string => dateFormat({ month: "long", year: "numeric" }).format(Date.UTC(year, month - 1, 1));

/** "Nov 5, 2026", or "" when the key is not a real date. */
export const formatDateLabel = (key: string): string => {
  const p = parseDateKey(key);
  return p ? dateFormat({ month: "short", day: "numeric", year: "numeric" }).format(Date.UTC(p.year, p.month - 1, p.day)) : "";
};

/** "Thursday, November 5, 2026": the full text a screen reader hears for a day button. */
export const formatDateSpoken = (key: string): string => {
  const p = parseDateKey(key);
  return p ? dateFormat({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(Date.UTC(p.year, p.month - 1, p.day)) : "";
};

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

// ---------------------------------------------------------------- times

export interface TimeParts {
  /** 1 to 12. */
  hour12: number;
  /** 0 to 59. */
  minute: number;
  pm: boolean;
}

/** The parts of a time written HH:mm (a trailing :ss is accepted), or null. */
export const parseTime = (value: string): { hour: number; minute: number } | null => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
};

export const toTimeParts = (value: string): TimeParts | null => {
  const t = parseTime(value);
  return t ? { hour12: t.hour % 12 === 0 ? 12 : t.hour % 12, minute: t.minute, pm: t.hour >= 12 } : null;
};

/** The HH:mm text for a 12-hour clock reading ("12 AM" is 00:xx and "12 PM" is 12:xx). */
export const timeFromParts = ({ hour12, minute, pm }: TimeParts): string => `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;

/** "2:30 PM", or "" when the value is not a time. */
export const formatTimeLabel = (value: string): string => {
  const parts = toTimeParts(value);
  return parts ? `${parts.hour12}:${pad(parts.minute)} ${parts.pm ? "PM" : "AM"}` : "";
};

export const HOUR_CHOICES: readonly number[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Minutes offered in the selector: every 5 minutes, plus the current minute when it is not one of them (so it is never lost). */
export const minuteChoices = (current: number | null): number[] => {
  const base = Array.from({ length: 12 }, (_, i) => i * 5);
  return current !== null && !base.includes(current) ? [...base, current].sort((a, b) => a - b) : base;
};
