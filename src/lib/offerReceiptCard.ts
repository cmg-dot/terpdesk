import { formatInTimeZone } from "date-fns-tz";
import { escapeHtml } from "@/lib/emailTemplate";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobRequestRow } from "@/lib/jobSummary";
import { renderOfferShell } from "@/lib/offerResponseShell";
import type { ShellTone } from "@/lib/offerResponseShell";

/**
 * The receipt a magic-link response ends on ("Offer Accepted", "Offer Declined", "You're already booked") and the "Offer Expired or
 * Invalid" page, inside the shared shell (offerResponseShell.ts). Pure.
 */

export interface HtmlCardParams {
  status: Exclude<ShellTone, "ask">;
  title: string;
  message: string;
  subNotice?: string;
  jobDetails?: {
    title: string;
    date?: string;
    time?: string;
    location?: string;
    position?: string;
  };
}

const LABEL = `font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;`;
const VALUE = `font-size: 14px; font-weight: 500; color: #334155;`;

/** "Thu, Nov 26, 2026 • 10:00 AM - 11:30 AM (PST)": the date, then the time, with the separator only when both are there. */
export const scheduleLine = (date: string | undefined, time: string | undefined): string => [date, time].filter((part): part is string => Boolean(part && part.trim())).join(" &bull; ");

type Loose = Record<string, unknown>;
const isBag = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const validDate = (value: unknown): boolean => (typeof value === "string" || value instanceof Date) && !Number.isNaN(new Date(value).getTime());

/** Whether the job has a start of its own (the app reads createdAt as the start too). Without one, the app's resolver would invent today. */
function hasStart(row: JobRequestRow): boolean {
  const data = isBag(row.data) ? row.data : {};
  const details = isBag(data.details) ? data.details : {};
  const schedule = isBag(data.schedule) ? data.schedule : {};
  return [data.customStartsAt, data.startsAt, details.customStartsAt, details.startsAt, schedule.startsAt, row.createdAt].some(validDate);
}

/** "2026-11-26" as "Thu, Nov 26, 2026"; any other written date is shown as it was written. */
const writtenDate = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? formatInTimeZone(new Date(`${text}T12:00:00Z`), "UTC", "EEE, MMM d, yyyy") : text;
};

/**
 * The date a receipt shows, in the same words as the confirm page and the app ("Thu, Nov 26, 2026"). State jobs keep their date in the
 * schedule, not in `details.date`, so the job's own summary is the source whenever the job has a start. The date written on the job is
 * the fallback, and a job with neither shows no date (the receipt then leaves out the bullet too).
 */
export function receiptDateLabel(row: JobRequestRow, written: unknown): string | undefined {
  if (hasStart(row)) {
    try {
      const label = summarizeJob(row).dateLabel;
      if (label && label !== "Date to be confirmed") return label;
    } catch {
      // An unreadable schedule: fall back to the date written on the job.
    }
  }
  return writtenDate(written);
}

function detailsHtml(raw: NonNullable<HtmlCardParams["jobDetails"]>): string {
  // Job fields come from the database (agency-entered), so they are escaped before going into the HTML.
  const when = scheduleLine(raw.date ? escapeHtml(String(raw.date)) : undefined, raw.time ? escapeHtml(raw.time) : undefined);
  const block = (label: string, value: string, last = false): string =>
    `<div style="${LABEL}">${label}</div><div style="${VALUE}${last ? "" : " margin-bottom: 12px;"}">${value}</div>`;
  const rows = [
    when ? block("Scheduled Time", when) : "",
    raw.location ? block("Location / Platform", escapeHtml(raw.location)) : "",
    raw.position ? block("Role", escapeHtml(raw.position), true) : "",
  ].join("\n");
  return `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin: 24px 0 0;">
    <div style="${LABEL}">Assignment</div>
    <div style="font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">${escapeHtml(raw.title)}</div>
    ${rows}
  </div>`;
}

export function renderHtmlCard({ status, title, message, subNotice, jobDetails }: HtmlCardParams): Response {
  return renderOfferShell({ tone: status, title, message, subNotice, bodyHtml: jobDetails ? detailsHtml(jobDetails) : "" });
}
