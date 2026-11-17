/** Safe readers for the loosely typed JSON on a request (`requests.data`), for the billing engine. Pure. */

export type Loose = Record<string, unknown>;

export const asObject = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

export const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A finite number from a number or numeric text; null otherwise. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const instant = (value: unknown): number => (value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN);

/** Minutes from `start` to `end` (ISO strings or Dates); NaN when either cannot be read. */
export const minutesBetween = (start: unknown, end: unknown): number => (instant(end) - instant(start)) / 60000;

/**
 * Worked minutes: actual end - start - break. When the times cannot be read, `billableHours` (a staff-logged state receipt's
 * service hours) stands in. Null when neither is known.
 */
export function workedMinutesOf(start: unknown, end: unknown, breakMinutes: unknown, billableHours: string | null): number | null {
  const span = minutesBetween(start, end);
  if (Number.isFinite(span) && span > 0) return Math.max(0, Math.round(span - (num(breakMinutes) ?? 0)));
  const hours = num(billableHours);
  return hours !== null && hours > 0 ? Math.round(hours * 60) : null;
}
