import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests } from "@/db/schema";
import { getBaseUrl } from "@/lib/baseUrl";
import { writeAuditLog } from "@/lib/audit";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton, emailDetailsTable, emailHeroButton, emailSecondaryButton, escapeHtml } from "@/lib/emailTemplate";
import { createJobDetailsToken } from "@/lib/jobDetailsToken";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobSummary } from "@/lib/jobSummary";
import { sendEmail } from "@/lib/timesheetEmail";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Job emails with progressive disclosure. These emails carry the restricted summary only (reference, title, date and
 * time, format, generic setting, role, broad program type). Addresses, prep notes and materials are never emailed;
 * after acceptance they are on the secure details page that the confirmation links to.
 *
 * SERVER ONLY.
 */

const summaryRows = (s: JobSummary) => [
  { label: "Reference", value: s.reference },
  { label: "Assignment", value: s.title },
  { label: "Date", value: s.dateLabel },
  { label: "Time", value: s.timeLabel },
  { label: "Format", value: s.format },
  { label: "Setting", value: s.setting },
  { label: "Role", value: s.role },
  { label: "Program", value: s.program },
];

const summaryText = (s: JobSummary) => summaryRows(s).map((r) => `${r.label}: ${r.value}`).join("\n");

/** The offer email: restricted details plus Accept / Decline links. */
export function buildOfferEmail(s: JobSummary, acceptUrl: string, declineUrl: string): { subject: string; html: string; text: string } {
  const locationNote = s.isVirtual
    ? "The meeting link is shared after you accept."
    : "The exact location is shared after you accept.";
  const html = buildTerpDeskEmail({
    title: `Job offer ${s.reference}`,
    preheader: `A new interpreting job offer for ${s.dateLabel}. Please respond promptly.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You have a new job offer</h1>
      <p style="margin:0 0 4px;">Review the details below and respond. ${escapeHtml(locationNote)} Preparation notes and materials follow once you're booked.</p>
      ${emailActionCard(`
        ${emailDetailsTable(summaryRows(s))}
        <p style="margin:20px 0 12px;">${emailButton("Accept job offer", acceptUrl)}</p>
        <p style="margin:0;">${emailSecondaryButton("Decline offer", declineUrl)}</p>
      `)}
      <p style="margin:0;font-size:13px;color:#6B7280;">No password is needed. This link is valid for 48 hours.</p>`,
  });
  const text = [
    "You have a new interpreting job offer.",
    "",
    summaryText(s),
    "",
    locationNote,
    "",
    `Accept: ${acceptUrl}`,
    `Decline: ${declineUrl}`,
    "",
    "No password is needed. This link is valid for 48 hours.",
  ].join("\n");
  return { subject: `Job offer ${s.reference} - terpDESK`, html, text };
}

function buildConfirmationEmail(s: JobSummary, name: string, detailsUrl: string | null): { subject: string; html: string; text: string } {
  const detailsBlock = detailsUrl
    ? `<p style="margin:20px 0 8px;">${emailButton("View full job details", detailsUrl)}</p>
       <p style="margin:0;font-size:13px;color:#6B7280;">The exact location or meeting link, program, preparation notes and prep materials are on this private page (no password needed). Prep materials are also in the terpDESK app.</p>`
    : `<p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Sign in to terpDESK to see the location, preparation notes and prep materials.</p>`;
  const html = buildTerpDeskEmail({
    title: `Booking confirmed ${s.reference}`,
    preheader: `You're booked for ${s.dateLabel}.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You're booked${name ? `, ${escapeHtml(name)}` : ""}</h1>
      <p style="margin:0 0 4px;">Thanks for accepting. Here is your booking.</p>
      ${emailActionCard(`${emailDetailsTable(summaryRows(s))}${detailsBlock}`)}
      <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, location and preparation details are never sent by email. Please don't forward this message.</p>`,
  });
  const text = [
    `You're booked${name ? `, ${name}` : ""}.`,
    "",
    summaryText(s),
    "",
    detailsUrl
      ? `Full job details (location, program, preparation notes, prep materials): ${detailsUrl}`
      : "Sign in to terpDESK to see the location, preparation notes and prep materials.",
    "",
    "For your clients' privacy, location and preparation details are never sent by email.",
  ].join("\n");
  return { subject: `Booking confirmed ${s.reference} - terpDESK`, html, text };
}

/** The external portal where ODHH interpreters report the assignment (kept exactly as the state publishes it). */
export const ODHH_ASSIGNMENT_REPORT_URL = "https://fortress.wa.gov/dshs/odhhapps/Interpreters/AssignmentReport.aspx/";

/**
 * "Post-Job Action Required" for an ODHH job that has ended: submit the hours in the state portal.
 * Restricted summary only (no address, client or notes). Throws if the email cannot be sent, so the caller can retry.
 */
export async function sendOdhhPostJobReminder(params: { to: string; name: string; summary: JobSummary }): Promise<void> {
  const s = params.summary;
  const html = buildTerpDeskEmail({
    title: `Post-job action required ${s.reference}`,
    preheader: "Your ODHH assignment has ended. Please submit your hours.",
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Post-job action required</h1>
      <p style="margin:0 0 4px;">${params.name ? `Hi ${escapeHtml(params.name)}, y` : "Y"}our ODHH assignment has ended. Please submit your hours in the ODHH Assignment Report portal so you are paid.</p>
      ${emailActionCard(`
        ${emailHeroButton("Submit via ODHH Portal", ODHH_ASSIGNMENT_REPORT_URL)}
        <p style="margin:10px 0 20px;font-size:12px;color:#6B7280;text-align:center;">Button not working? Copy this link: ${escapeHtml(ODHH_ASSIGNMENT_REPORT_URL)}</p>
        ${emailDetailsTable(summaryRows(s))}
      `)}
      <p style="margin:0;font-size:13px;color:#6B7280;">If you already submitted these hours, you can ignore this reminder.</p>`,
  });
  const text = [
    "Post-job action required.",
    "",
    "Your ODHH assignment has ended. Please submit your hours in the ODHH Assignment Report portal so you are paid.",
    "",
    summaryText(s),
    "",
    `Submit via ODHH Portal: ${ODHH_ASSIGNMENT_REPORT_URL}`,
    "",
    "If you already submitted these hours, you can ignore this reminder.",
  ].join("\n");
  await sendEmail(params.to, `Post-job action required: submit your ODHH hours (${s.reference})`, html, text);
}

/**
 * Sends the booking confirmation after an interpreter accepts (in the app or through the email link), is assigned
 * directly, or when staff choose "Resend details". Never throws: a failed email must not undo or block the booking.
 * Returns whether the email went out.
 */
export async function sendBookingConfirmation(params: { requestId: string; interpreterId: string; positionNumber?: number }): Promise<boolean> {
  try {
    const [request] = await db
      .select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
      .from(requests)
      .where(eq(requests.id, params.requestId))
      .limit(1);
    const [interpreter] = await db
      .select({ email: interpreters.email })
      .from(interpreters)
      .where(eq(interpreters.id, params.interpreterId))
      .limit(1);
    if (!request || !interpreter?.email) return false;

    const summary = summarizeJob(request, params.positionNumber);
    let endsAt = new Date(NaN);
    try {
      endsAt = new Date(resolveRequestTimes(request).endsAt);
    } catch {
      // Token falls back to its minimum lifetime.
    }
    const token = createJobDetailsToken({ requestId: request.id, interpreterId: params.interpreterId }, endsAt);
    const detailsUrl = token ? `${getBaseUrl()}/job-details?token=${encodeURIComponent(token)}` : null;
    const name = (await getInterpreterDisplayName(params.interpreterId).catch(() => null)) ?? "";

    const email = buildConfirmationEmail(summary, name, detailsUrl);
    await sendEmail(interpreter.email, email.subject, email.html, email.text);
    await writeAuditLog({
      action: "booking_confirmation_sent",
      details: `requestId=${request.id}; interpreterId=${params.interpreterId}`,
    });
    return true;
  } catch {
    // Never log the error object here: it can include the recipient address.
    console.error("[jobEmails] could not send the booking confirmation");
    return false;
  }
}
