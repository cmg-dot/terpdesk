import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Layout maths for the Interpreter View (a resource timeline: one row per interpreter, time running left to right).
 * Pure functions, no I/O: safe in client components.
 *
 * One day is drawn on one axis in ONE zone (the agency's), from its local midnight to the next local midnight, so a day
 * with a daylight-saving change correctly has 23 or 25 hours. A job is placed by where it falls inside that window and
 * clipped when it runs past either edge.
 */

export interface DayWindow {
  dateKey: string;
  zone: string;
  startMs: number;
  endMs: number;
  /** One tick per started hour, with its label in the zone ("9 AM"). */
  hours: { ms: number; label: string }[];
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar date after `dateKey` (pure date arithmetic: no zone is involved). */
export const nextDateKey = (dateKey: string): string => {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new Error("Not a date.");
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return next.toISOString().slice(0, 10);
};

export const previousDateKey = (dateKey: string): string => {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new Error("Not a date.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1)).toISOString().slice(0, 10);
};

/** True for a real calendar date written yyyy-MM-dd. */
export const isDateKey = (value: string): boolean => {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
};

export const dayWindow = (dateKey: string, zone: string): DayWindow => {
  const startMs = fromZonedTime(`${dateKey}T00:00:00`, zone).getTime();
  const endMs = fromZonedTime(`${nextDateKey(dateKey)}T00:00:00`, zone).getTime();
  const hours: DayWindow["hours"] = [];
  for (let ms = startMs; ms < endMs; ms += 3_600_000) hours.push({ ms, label: formatInTimeZone(ms, zone, "h a") });
  return { dateKey, zone, startMs, endMs, hours };
};

export interface TimedJob {
  startsAt: string;
  endsAt: string;
}

export interface JobBlock<J extends TimedJob> {
  job: J;
  /** Position and width as a percentage of the day's width. */
  leftPct: number;
  widthPct: number;
  /** Row of the stack the block sits in (0 = top): overlapping jobs for one interpreter never hide each other. */
  lane: number;
  /** The job began before this day / ends after it, so the block is cut at the edge. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface RowLayout<J extends TimedJob> {
  blocks: JobBlock<J>[];
  laneCount: number;
}

/** Jobs that touch the day, placed on the axis; overlapping ones go to separate lanes. Jobs outside the day are dropped. */
export const layoutRow = <J extends TimedJob>(jobs: readonly J[], window: DayWindow): RowLayout<J> => {
  const span = window.endMs - window.startMs;
  const placed = jobs
    .map((job) => ({ job, start: new Date(job.startsAt).getTime(), end: new Date(job.endsAt).getTime() }))
    .filter(({ start, end }) => !Number.isNaN(start) && !Number.isNaN(end) && end > window.startMs && start < window.endMs)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds: number[] = [];
  const blocks: JobBlock<J>[] = placed.map(({ job, start, end }) => {
    const from = Math.max(start, window.startMs);
    const to = Math.min(end, window.endMs);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    return {
      job,
      leftPct: ((from - window.startMs) / span) * 100,
      widthPct: Math.max(((to - from) / span) * 100, 0),
      lane,
      clippedStart: start < window.startMs,
      clippedEnd: end > window.endMs,
    };
  });
  return { blocks, laneCount: Math.max(laneEnds.length, 1) };
};

/** Where "now" falls on the axis as a percentage, or null when it isn't inside this day. */
export const nowPercent = (window: DayWindow, nowMs: number): number | null =>
  nowMs >= window.startMs && nowMs < window.endMs ? ((nowMs - window.startMs) / (window.endMs - window.startMs)) * 100 : null;

export type JobTone = "live" | "past" | "attention" | "booked";

/** How a block is coloured: happening now, already over, needing attention (partly staffed / replacement), or booked. */
export const jobTone = (status: string, startsAt: string, endsAt: string, nowMs: number): JobTone => {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (nowMs >= start && nowMs < end) return "live";
  if (nowMs >= end) return "past";
  return /partial|replacement/i.test(status) ? "attention" : "booked";
};
