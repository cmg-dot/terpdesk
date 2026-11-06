import { FORMAT_LABELS, parseIntakeEmail } from "@/lib/odhhEmailParser";
import { parseServiceVerification } from "@/lib/odhhVerificationParser";
import type { InboxCategory } from "@/lib/inboxCategory";

/**
 * What the intake parser makes of an email, as rows for the "Parsed Data" tab: label and value (null when the email does not say).
 * Only job details and the report's figures are listed. The client's and the requester's details stay in the raw message and on
 * the request, never in this summary. Pure; a message the parsers cannot read gives no rows rather than an error.
 */

export interface ParsedRow {
  label: string;
  value: string | null;
}

const clock = (hhmm: string | null): string | null => {
  const match = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null;
  if (!match) return null;
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};
const when = (date: string | null, time: string | null): string | null => {
  const parts = [date, clock(time)].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
};
const yesNo = (value: boolean | null): string | null => (value === null ? null : value ? "Yes" : "No");

export function parsedRowsFor(category: InboxCategory, subject: string, bodyText: string): { title: string; rows: ParsedRow[] } | null {
  try {
    if (category === "request") {
      const p = parseIntakeEmail(bodyText, subject);
      return {
        title: "Request details read from the email",
        rows: [
          { label: "Service request #", value: p.srn },
          { label: "Date", value: p.date },
          { label: "Time", value: p.startTime && p.endTime ? `${p.startTime} – ${p.endTime}` : p.startTime },
          { label: "Location", value: p.venue },
          { label: "Address", value: p.address },
          { label: "Format", value: p.format ? FORMAT_LABELS[p.format] : null },
          { label: "Platform", value: p.platform },
          { label: "Meeting link", value: p.meetingLink ? "Found" : null },
          { label: "Appointment note", value: p.appointmentNote ? "Included" : null },
        ],
      };
    }
    if (category === "slicr") {
      const v = parseServiceVerification(bodyText);
      return {
        title: "Service verification read from the report",
        rows: [
          { label: "Service request #", value: v.srn },
          { label: "Interpreter", value: [v.interpreterName, v.interpreterCredentials ? `(${v.interpreterCredentials})` : null].filter(Boolean).join(" ") || null },
          { label: "Actual start", value: when(v.startDate, v.startTime) },
          { label: "Actual end", value: when(v.endDate, v.endTime) },
          { label: "Total miles", value: v.totalMiles === null ? null : String(v.totalMiles) },
          { label: "Other fees", value: v.otherFeesText },
          { label: "Service complete", value: yesNo(v.serviceComplete) },
          { label: "Cancellation", value: v.cancellation },
          { label: "State's comment", value: v.comments ? "Included" : null },
        ],
      };
    }
    return null;
  } catch {
    return null;
  }
}
