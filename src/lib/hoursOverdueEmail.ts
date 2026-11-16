import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_ZONE } from "@/lib/businessHours";
import { buildTerpDeskEmail, emailActionCard, emailDetailsTable, emailHeroButton, escapeHtml } from "@/lib/emailTemplate";
import { interpreterEmailTitle, summaryRows, summaryText } from "@/lib/jobEmails";
import type { JobSummary } from "@/lib/jobSummary";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";

/**
 * The one-time "hours overdue" reminder (api/cron/hours-overdue): the restricted job summary only, like every job email (no address,
 * client or notes), and where to submit. A state job is submitted on the state's Verification Form; any other job in terpDESK (a link
 * to the job for an interpreter who signs in, else the timesheet link they were already emailed). SERVER ONLY.
 */

export interface OverdueEmailInput {
  summary: JobSummary;
  name: string;
  dueAt: Date;
  isStateJob: boolean;
  /** The interpreter's job page in terpDESK, when they have a login (null for an external profile). */
  jobUrl: string | null;
}

export function buildHoursOverdueEmail(p: OverdueEmailInput): { subject: string; html: string; text: string } {
  const s = p.summary;
  const due = formatInTimeZone(p.dueAt, BUSINESS_ZONE, "EEE, MMM d 'at' h:mm a zzz");
  const where: { line: string; button: { label: string; url: string } | null } = p.isStateJob
    ? { line: "This is a state job: submit your hours on the ODHH Verification Form.", button: { label: "Submit via ODHH Verification Form", url: ODHH_VERIFICATION_FORM_URL } }
    : p.jobUrl
      ? { line: "Submit your hours in terpDESK.", button: { label: "Submit hours in terpDESK", url: p.jobUrl } }
      : { line: "Use the timesheet link we emailed you after the assignment, or ask your agency for a new one.", button: null };
  const intro = `Your hours for this assignment were due by ${due} (48 business hours after it ended). ${where.line}`;
  const html = buildTerpDeskEmail({
    title: interpreterEmailTitle("Hours overdue", s),
    preheader: `Your hours for ${s.dateLabel} are overdue.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Your hours are overdue</h1>
      <p style="margin:0 0 4px;">${p.name ? `Hi ${escapeHtml(p.name)}, y` : "Y"}${escapeHtml(intro.slice(1))}</p>
      ${emailActionCard(`${where.button ? emailHeroButton(where.button.label, where.button.url) : ""}${emailDetailsTable(summaryRows(s))}`)}
      <p style="margin:0;font-size:13px;color:#6B7280;">If you already submitted these hours, you can ignore this reminder.</p>`,
  });
  const text = [
    "Your hours are overdue.",
    "",
    intro,
    "",
    summaryText(s),
    ...(where.button ? ["", `${where.button.label}: ${where.button.url}`] : []),
    "",
    "If you already submitted these hours, you can ignore this reminder.",
  ].join("\n");
  return { subject: `${interpreterEmailTitle("Hours overdue", s)} - terpDESK`, html, text };
}
