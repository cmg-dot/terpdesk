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

/** "Mon, Dec 7, 2026 · 9:00 AM to 11:30 AM PST" in the job's own zone; an end on another day carries its date. */
export function personalJobWhen(job: Pick<PersonalJobView, "startsAt" | "endsAt" | "timeZone">): string {
  const start = new Date(job.startsAt);
  const end = new Date(job.endsAt);
  const zone = job.timeZone;
  const sameDay = formatInTimeZone(start, zone, "yyyy-MM-dd") === formatInTimeZone(end, zone, "yyyy-MM-dd");
  const endText = sameDay ? formatInTimeZone(end, zone, "h:mm a zzz") : formatInTimeZone(end, zone, "EEE, MMM d, h:mm a zzz");
  return `${formatInTimeZone(start, zone, "EEE, MMM d, yyyy")} · ${formatInTimeZone(start, zone, "h:mm a")} to ${endText}`;
}

/** The calendar block on a card: the start's month ("NOV") and day ("24") in the zone the job was entered in. */
export function personalJobDateTile(job: Pick<PersonalJobView, "startsAt" | "timeZone">): { month: string; day: string } {
  const start = new Date(job.startsAt);
  return { month: formatInTimeZone(start, job.timeZone, "MMM").toUpperCase(), day: formatInTimeZone(start, job.timeZone, "d") };
}

/** "2 h 15 min", "45 min", "3 h". */
export function hoursLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The personal job form's values: text, as the fields hold them. */
export interface PersonalJobFormValues {
  label: string;
  setting: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
  breakMinutes: string;
  miles: string;
  roundTrip: boolean;
}

/** A new job: today, 9:00 to 10:00, in `timeZone`. `today` is yyyy-MM-dd in that zone. */
export const emptyPersonalJobForm = (timeZone: string, today: string): PersonalJobFormValues => ({
  label: "", setting: "", startDate: today, startTime: "09:00", endDate: today, endTime: "10:00", timeZone, breakMinutes: "", miles: "", roundTrip: false,
});

/** A saved job as the form shows it for editing: the wall-clock times in the zone it was entered in. */
export function personalJobFormValues(job: PersonalJobView): PersonalJobFormValues {
  const start = new Date(job.startsAt);
  const end = new Date(job.endsAt);
  return {
    label: job.label,
    setting: job.setting,
    startDate: formatInTimeZone(start, job.timeZone, "yyyy-MM-dd"),
    startTime: formatInTimeZone(start, job.timeZone, "HH:mm"),
    endDate: formatInTimeZone(end, job.timeZone, "yyyy-MM-dd"),
    endTime: formatInTimeZone(end, job.timeZone, "HH:mm"),
    timeZone: job.timeZone,
    breakMinutes: job.breakMinutes === 0 ? "" : String(job.breakMinutes),
    miles: job.miles === null ? "" : String(job.miles),
    roundTrip: job.roundTrip,
  };
}
