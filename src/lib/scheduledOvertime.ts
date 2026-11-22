/**
 * Reported time that runs longer than the job's CURRENT schedule (after a shortened booking, the new length). The interpreter's
 * hours form warns and asks for a service note explaining it (submitInterpreterHours.ts enforces the note), and Hours review shows
 * an "Exceeds scheduled" pill so staff check it before approving. Overtime itself is never refused. Pure.
 *
 * A routine wrap-up of up to 15 minutes needs no note (OVERTIME_GRACE_MINUTES): the form stays quiet and the server accepts it.
 * Only time MORE than 15 minutes over (actual minutes greater than scheduled minutes plus 15) asks for a note. The Hours review pill
 * is the staff's view of any overage and is unchanged: it shows whatever runs past the schedule, with or without a note.
 */

/** Minutes over the schedule that need no explanation; the note is required only beyond this. */
export const OVERTIME_GRACE_MINUTES = 15;

/** True when the overage is past the grace, so the form warns and a service note is required. */
export const exceedsGrace = (overMinutes: number): boolean => overMinutes > OVERTIME_GRACE_MINUTES;

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

/** The hours form's inline warning while the entered times run more than the grace past the schedule. */
export const overtimeWarning = (minutes: number, scheduledText: string): string =>
  `These times are ${formatOvertime(minutes)} longer than the scheduled ${scheduledText}. Running more than ${OVERTIME_GRACE_MINUTES} minutes over needs a note: if you worked the extra time, explain it in the service note below so the agency can approve it.`;

/** The server's refusal when overtime past the grace has no note (the form blocks this first). */
export const OVERTIME_NOTE_REQUIRED = `These times are more than ${OVERTIME_GRACE_MINUTES} minutes longer than the scheduled time. Add a service note explaining the extra time, then submit again.`;

/** Overtime past the 15-minute grace is accepted only with a service note that says something; up to 15 minutes over needs none. */
export const overtimeNeedsNote = (overMinutes: number, note: string | null | undefined): boolean => exceedsGrace(overMinutes) && !(note ?? "").trim();
