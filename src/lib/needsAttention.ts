import { resolveRequestTimes } from "@/utils/timezone";

/**
 * The dashboard's "Needs attention" order. Jobs starting within a week come first (so Kari sees what is imminent), the rest
 * follow; inside each group the most urgent status leads, and ties go to the soonest start. Pure: no I/O.
 */

export const NEEDS_ATTENTION_HORIZON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lower is more urgent. `status` is the staffing label shown on the card. */
export function needsAttentionRank(status: unknown): number {
  const s = String(status ?? "").toLowerCase();
  if (s === "needs replacement") return 1;
  if (s === "staff follow-up") return 2;
  if (s.includes("awaiting") || s.includes("offer") || s.includes("pending")) return 3;
  if (s.includes("unfilled") || s.includes("draft") || s.includes("partially")) return 4;
  return 5;
}

type AttentionJob = { displayStatus?: unknown; startsAt?: string | Date | null; endsAt?: string | Date | null; [key: string]: unknown };

/**
 * Start time in ms, read the way every other list reads it (a job with no date at all counts as starting now, so it is
 * listed near the top for someone to fix; only an unparseable value sorts last).
 */
const startMs = (job: AttentionJob): number => {
  const startsAt = resolveRequestTimes(job as never)?.startsAt;
  const ms = startsAt ? new Date(startsAt).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

/** True when the job starts after the horizon (or has no start): it is listed, but not at the top. */
export const startsLater = (job: AttentionJob, nowMs: number): boolean => startMs(job) > nowMs + NEEDS_ATTENTION_HORIZON_DAYS * DAY_MS;

export function sortNeedsAttention<T extends AttentionJob>(jobs: readonly T[], nowMs: number): T[] {
  return jobs
    .map((job) => ({ job, later: startsLater(job, nowMs) ? 1 : 0, rank: needsAttentionRank(job.displayStatus), start: startMs(job) }))
    .sort((a, b) => a.later - b.later || a.rank - b.rank || (a.start === b.start ? 0 : a.start < b.start ? -1 : 1))
    .map((entry) => entry.job);
}

export const countStartingLater = (jobs: readonly AttentionJob[], nowMs: number): number => jobs.filter((job) => startsLater(job, nowMs)).length;
