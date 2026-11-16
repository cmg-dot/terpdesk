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

/** "TUE, NOV 18 · 9:00 AM - 10:30 AM PST" in the job's own zone; "Date TBD" when it has no usable start. */
export function jobDateLine(job: DatedJob): string {
  const details = job.details ?? {};
  const start = job.startsAt || (str(details.startDate) ? `${str(details.startDate)}T${str(details.startTime) || "00:00"}` : "");
  const end = job.endsAt || (str(details.endDate) ? `${str(details.endDate)}T${str(details.endTime) || "00:00"}` : "");
  if (!start) return job.dateString || "Date TBD";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "Date TBD";
  const zone = getIanaZone(str(details.timeZone) || job.timeZone);
  const endDate = end ? new Date(end) : null;
  const day = formatInTimeZone(startDate, zone, "EEE, MMM d").toUpperCase();
  const from = formatInTimeZone(startDate, zone, "h:mm a");
  const to = formatInTimeZone(endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate, zone, "h:mm a zzz");
  return `${day} · ${from} - ${to}`;
}
