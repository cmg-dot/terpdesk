import { formatInTimeZone } from "date-fns-tz";
import type { MileageRange } from "@/lib/mileageSummary";
import { roundMiles } from "@/lib/timesheetSchemas";

/**
 * Personal jobs: what an interpreter logs for work done outside any agency. Hours, miles and the CSV rows are worked out here, from
 * the times and miles alone. No rates, earnings, payer or notes exist. Pure (safe for the browser, the server and tests).
 */

/** A row of interpreter_personal_jobs as the database returns it (numeric columns arrive as text). */
export interface PersonalJobRecord {
  id: string;
  label: string | null;
  setting: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  breakMinutes: number;
  miles: string | null;
  roundTrip: boolean;
  countedMiles: string | null;
}

/** A personal job as the browser sees it. */
export interface PersonalJobView {
  id: string;
  /** "" when none was given. Private to the interpreter. */
  label: string;
  /** "" when none was chosen. */
  setting: string;
  /** ISO (UTC). */
  startsAt: string;
  endsAt: string;
  timeZone: string;
  breakMinutes: number;
  /** One-way miles as entered; null when none were entered. */
  miles: number | null;
  roundTrip: boolean;
  /** What the miles count for (doubled for a round trip); null when no miles were entered. */
  countedMiles: number | null;
  workedMinutes: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Minutes between start and end, less the unpaid break. Never negative. */
export function workedMinutes(startsAt: Date | string, endsAt: Date | string, breakMinutes: number): number {
  const span = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / MINUTE_MS);
  return Number.isFinite(span) ? Math.max(0, span - Math.max(0, breakMinutes)) : 0;
}

/** What entered miles count for: doubled for a round trip, to one decimal. null when no miles were entered. */
export const countedMiles = (miles: number | null, roundTrip: boolean): number | null =>
  miles === null ? null : roundMiles(miles * (roundTrip ? 2 : 1));

const numberOrNull = (value: string | null): number | null => (value === null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

export function toPersonalJobView(row: PersonalJobRecord): PersonalJobView {
  const miles = numberOrNull(row.miles);
  return {
    id: row.id,
    label: row.label ?? "",
    setting: row.setting ?? "",
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: row.timeZone,
    breakMinutes: row.breakMinutes,
    miles,
    roundTrip: row.roundTrip,
    // The server's figure when it was saved, else worked out the same way.
    countedMiles: numberOrNull(row.countedMiles) ?? countedMiles(miles, row.roundTrip),
    workedMinutes: workedMinutes(row.startsAt, row.endsAt, row.breakMinutes),
  };
}

/** The jobs that started within the range, newest first. `nowMs` is passed in so a render is stable. */
export function personalJobsInRange(jobs: readonly PersonalJobView[], range: MileageRange, nowMs: number): PersonalJobView[] {
  const since = range === "all" ? -Infinity : nowMs - Number(range) * DAY_MS;
  return jobs
    .filter((job) => {
      const t = new Date(job.startsAt).getTime();
      return Number.isNaN(t) ? range === "all" : t >= since;
    })
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

export interface PersonalJobTotals {
  jobs: number;
  workedMinutes: number;
  /** workedMinutes as hours, to two decimals. */
  hours: number;
  /** Counted miles (round trips doubled), to one decimal. */
  miles: number;
}

export function personalJobTotals(jobs: readonly PersonalJobView[]): PersonalJobTotals {
  const minutes = jobs.reduce((sum, job) => sum + job.workedMinutes, 0);
  return {
    jobs: jobs.length,
    workedMinutes: minutes,
    hours: Math.round((minutes / 60) * 100) / 100,
    miles: roundMiles(jobs.reduce((sum, job) => sum + (job.countedMiles ?? 0), 0)),
  };
}

export const PERSONAL_JOB_CSV_HEADER = [
  "Date", "Start time", "End date", "End time", "Time zone", "Setting", "Label", "Break (minutes)", "Hours worked", "Miles", "Round trip", "Counted miles",
] as const;

/** One CSV row per job, oldest first, in each job's own time zone. The caller serialises (and must escape formula cells). */
export function personalJobCsvRows(jobs: readonly PersonalJobView[]): string[][] {
  return [...jobs]
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((job) => {
      const start = new Date(job.startsAt);
      const end = new Date(job.endsAt);
      return [
        formatInTimeZone(start, job.timeZone, "yyyy-MM-dd"),
        formatInTimeZone(start, job.timeZone, "HH:mm"),
        formatInTimeZone(end, job.timeZone, "yyyy-MM-dd"),
        formatInTimeZone(end, job.timeZone, "HH:mm"),
        job.timeZone,
        job.setting,
        job.label,
        String(job.breakMinutes),
        (job.workedMinutes / 60).toFixed(2),
        job.miles === null ? "" : job.miles.toFixed(1),
        job.roundTrip ? "Yes" : "No",
        job.countedMiles === null ? "" : job.countedMiles.toFixed(1),
      ];
    });
}
