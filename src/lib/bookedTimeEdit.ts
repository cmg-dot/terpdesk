import type { Instants } from "@/lib/editTimes";
import type { JobSummary } from "@/lib/jobSummary";
import type { JobFieldChange } from "@/lib/requestChanges";
import type { TimeChange } from "@/lib/timeChange";

/**
 * Moving the date or times of a job that has a booked interpreter (allowed until the appointment starts: bookedEditLimits.ts):
 *  - every booked interpreter must be free at the new time (no other booking, no busy block), or the save is refused;
 *  - the first move keeps the booked window as `originalScheduledStart` / `originalScheduledEnd` on the job, for billing later;
 *  - the booked interpreters get a "Schedule updated" banner (and the usual "Job details updated" email: jobUpdateNotice.ts).
 * Pure: the conflict check and the name look-up are passed in, so this is tested without a database.
 */

export const STATE_PORTAL_TIME_NOTE = "Updating times here notifies booked interpreters and updates your calendar, but does not update the State portal.";

export type ConflictCheck = (params: { interpreterId: string; startsAtUtc: string; endsAtUtc: string; excludeRequestId: string }) => Promise<{ hasConflict: boolean; reason?: "job" | "busy" }>;

export interface ConflictDeps {
  check: ConflictCheck;
  nameOf: (interpreterId: string) => Promise<string | null>;
}

/** The refusal to show staff when a booked interpreter is not free at the new time; null when everyone is. */
export async function bookedTimeConflict(params: { requestId: string; booked: readonly { interpreterId: string }[]; window: Instants }, deps: ConflictDeps): Promise<string | null> {
  const ids = Array.from(new Set(params.booked.map((b) => b.interpreterId)));
  for (const interpreterId of ids) {
    const result = await deps.check({ interpreterId, startsAtUtc: params.window.startsAt, endsAtUtc: params.window.endsAt, excludeRequestId: params.requestId });
    if (!result.hasConflict) continue;
    const name = (await deps.nameOf(interpreterId).catch(() => null)) || "A booked interpreter";
    const why = result.reason === "busy" ? "has marked that time as busy" : "has another booking at that time";
    return `${name} ${why}, so the new time was not saved. Choose another time, or remove their booking first.`;
  }
  return null;
}

/**
 * The job's data with the window it was booked for kept as `originalScheduledStart` / `originalScheduledEnd`: set on the first move of a
 * booked job only, and never overwritten by a later move (so it always names the window the interpreter first accepted).
 */
export interface OriginalSchedule {
  originalScheduledStart?: string;
  originalScheduledEnd?: string;
}

export function withOriginalSchedule<T extends object>(data: T, change: TimeChange | null, booked: boolean): T & OriginalSchedule {
  if (!booked || !change) return data;
  const current = data as Record<string, unknown>;
  if (typeof current.originalScheduledStart === "string" && current.originalScheduledStart) return data;
  return { ...data, originalScheduledStart: change.before.startsAt, originalScheduledEnd: change.before.endsAt };
}

/** The interpreter-visible fields that mean the appointment moved. */
const SCHEDULE_FIELDS = new Set(["Date", "Time", "Time zone"]);

export const movesSchedule = (changes: readonly Pick<JobFieldChange, "field">[]): boolean => changes.some((c) => SCHEDULE_FIELDS.has(c.field));

/**
 * The in-app banner and bell notice for a moved booking: "Schedule updated" over "<job header> moved to <date> at <time>.". In the app
 * only, where the header may name the job (the email names it by its date alone: jobUpdateNotice.ts).
 */
export function scheduleUpdateNotice(headline: string, summary: Pick<JobSummary, "dateLabel" | "timeLabel">, withMessage = false): { title: string; message: string } {
  return {
    title: "Schedule updated",
    message: `${headline} moved to ${summary.dateLabel} at ${summary.timeLabel}.${withMessage ? " The agency also sent you a message." : ""}`,
  };
}
