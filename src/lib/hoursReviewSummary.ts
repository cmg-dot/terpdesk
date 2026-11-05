import { formatHoursMinutes } from "@/lib/durationFormat";
import { formatDateInZone, getIanaZone, parseInstantInZone } from "@/utils/timezone";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/**
 * The few facts that make up a collapsed hours record: when, scheduled vs actual time, mileage, signature. Pure, so the row, the
 * expanded details and the tests read the same numbers.
 */

type TimedRecord = Pick<ServiceRecord, "actualStart" | "actualEnd" | "breakMinutes" | "timeZone">;

/** Minutes actually worked: the reported start to end, less the unpaid break. NaN when a time cannot be read. */
export function serviceMinutesOf(record: TimedRecord): number {
  const zone = getIanaZone(record.timeZone);
  const start = parseInstantInZone(record.actualStart, zone) ?? new Date(NaN);
  const end = parseInstantInZone(record.actualEnd, zone) ?? new Date(NaN);
  return Math.max(0, (end.getTime() - start.getTime()) / 60000 - (record.breakMinutes || 0));
}

/** Minutes that were booked (scheduled start to end). NaN when a time cannot be read. */
export function scheduledMinutesOf(record: Pick<ServiceRecord, "scheduledStart" | "scheduledEnd" | "timeZone">): number {
  const zone = getIanaZone(record.timeZone);
  const start = parseInstantInZone(record.scheduledStart, zone) ?? new Date(NaN);
  const end = parseInstantInZone(record.scheduledEnd, zone) ?? new Date(NaN);
  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

const miles = (value: number | null | undefined): string => `${(value ?? 0).toFixed(1)} mi`;

/** "+5 min" / "−10 min" when the worked time differs from the booking by a whole minute or more; null when it matches (or cannot be told). */
export function timeDifference(scheduled: number, actual: number): string | null {
  if (!Number.isFinite(scheduled) || !Number.isFinite(actual)) return null;
  const diff = Math.round(actual - scheduled);
  if (diff === 0) return null;
  const hours = Math.floor(Math.abs(diff) / 60);
  const minutes = Math.abs(diff) % 60;
  const size = hours > 0 ? `${hours} hr${minutes > 0 ? ` ${minutes} min` : ""}` : `${minutes} min`;
  return `${diff > 0 ? "+" : "−"}${size}`;
}

export interface RecordSummary {
  /** "Wed, Nov 4", in the job's own zone. */
  dateLabel: string;
  scheduledText: string;
  actualText: string;
  /** How far the worked time is from the booking, or null when they match. */
  difference: string | null;
  /** The reported mileage; once approved at a different figure, the approved one. */
  mileageText: string;
  /** Set when the approved mileage differs from the reported one: "Reported 5.0 mi". */
  mileageNote: string | null;
  signed: boolean;
}

export function summarizeRecord(record: ServiceRecord): RecordSummary {
  const zone = getIanaZone(record.timeZone);
  const scheduled = scheduledMinutesOf(record);
  const actual = serviceMinutesOf(record);
  const reported = record.reportedMileage ?? 0;
  const adjusted = record.state === "approved" && record.approvedMileage != null && Math.abs(record.approvedMileage - reported) >= 0.05;
  return {
    dateLabel: formatDateInZone(record.scheduledStart, zone, "EEE, MMM d"),
    scheduledText: formatHoursMinutes(scheduled),
    actualText: formatHoursMinutes(actual),
    difference: timeDifference(scheduled, actual),
    mileageText: adjusted ? miles(record.approvedMileage) : miles(reported),
    mileageNote: adjusted ? `Reported ${miles(reported)}` : null,
    signed: Boolean(record.signatureDataUrl),
  };
}
