/**
 * Reported time that runs longer than the job's CURRENT schedule (after a shortened booking, the new length). The interpreter's
 * hours form warns and asks for a service note explaining it (submitInterpreterHours.ts enforces the note), and Hours review shows
 * an "Exceeds scheduled" pill so staff check it before approving. Overtime itself is never refused. Pure.
 */

/** Whole minutes worked past the scheduled length; 0 when within it or when either length cannot be told. */
export function minutesOverSchedule(workedMinutes: number, scheduledMinutes: number): number {
  if (!Number.isFinite(workedMinutes) || !Number.isFinite(scheduledMinutes) || scheduledMinutes <= 0) return 0;
  return Math.max(0, Math.round(workedMinutes - scheduledMinutes));
}

/** Minutes from a start to an end (ISO instants), less the unpaid break; NaN when a time cannot be read. */
export function workedMinutesBetween(start: string | null | undefined, end: string | null | undefined, breakMinutes = 0): number {
  const a = start ? Date.parse(start) : NaN;
  const b = end ? Date.parse(end) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return (b - a) / 60000 - (Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0);
}

/** "+4h 0m". */
export const formatOvertime = (minutes: number): string => `+${Math.floor(minutes / 60)}h ${minutes % 60}m`;

/** The Hours review pill: "Exceeds scheduled (+4h 0m)". */
export const exceedsScheduledLabel = (minutes: number): string => `Exceeds scheduled (${formatOvertime(minutes)})`;

/** The hours form's inline warning while the entered times run past the schedule. */
export const overtimeWarning = (minutes: number, scheduledText: string): string =>
  `These times are ${formatOvertime(minutes)} longer than the scheduled ${scheduledText}. If you worked the extra time, explain it in the service note below so the agency can approve it.`;

/** The server's refusal when overtime has no note (the form blocks this first). */
export const OVERTIME_NOTE_REQUIRED = "These times are longer than the scheduled time. Add a service note explaining the extra time, then submit again.";

/** Overtime is accepted only with a service note that says something. */
export const overtimeNeedsNote = (overMinutes: number, note: string | null | undefined): boolean => overMinutes > 0 && !(note ?? "").trim();
