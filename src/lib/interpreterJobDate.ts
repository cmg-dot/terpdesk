import { formatInTimeZone } from "date-fns-tz";
import { getIanaZone } from "@/utils/timezone";

/** The parts of an interpreter's job its date line is built from. */
export interface DatedJob {
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string;
  dateString?: string;
  details?: { startDate?: unknown; startTime?: unknown; endDate?: unknown; endTime?: unknown; timeZone?: unknown } | null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * When a job is, as the strings its screens format: its own start and end, else its details' date and time ("2026-11-24T09:00"),
 * and the zone it names (its details', else the job's). Every part is undefined when the job has none.
 */
export function jobWhenParts(job: DatedJob): { start?: string; end?: string; zone?: string } {
  const details = job.details ?? {};
  return {
    start: job.startsAt || (str(details.startDate) ? `${str(details.startDate)}T${str(details.startTime) || "00:00"}` : undefined),
    end: job.endsAt || (str(details.endDate) ? `${str(details.endDate)}T${str(details.endTime) || "00:00"}` : undefined),
    zone: str(details.timeZone) || job.timeZone,
  };
}

/** "TUE, NOV 18 · 9:00 AM - 10:30 AM PST" in the job's own zone; "Date TBD" when it has no usable start. */
export function jobDateLine(job: DatedJob): string {
  const { start, end, zone: named } = jobWhenParts(job);
  if (!start) return job.dateString || "Date TBD";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "Date TBD";
  const zone = getIanaZone(named);
  const endDate = end ? new Date(end) : null;
  const day = formatInTimeZone(startDate, zone, "EEE, MMM d").toUpperCase();
  const from = formatInTimeZone(startDate, zone, "h:mm a");
  const to = formatInTimeZone(endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate, zone, "h:mm a zzz");
  return `${day} · ${from} - ${to}`;
}
