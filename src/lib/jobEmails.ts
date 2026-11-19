import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requests } from "@/db/schema";
import { getBaseUrl } from "@/lib/baseUrl";
import { writeAuditLog } from "@/lib/audit";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { buildTerpDeskEmail, emailActionCard, emailButton, emailDetailsTable, emailHeroButton, emailSecondaryButton, escapeHtml } from "@/lib/emailTemplate";
import { createJobDetailsToken } from "@/lib/jobDetailsToken";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";
import { summarizeJob } from "@/lib/jobSummary";
import type { JobSummary } from "@/lib/jobSummary";
import { sendEmail } from "@/lib/timesheetEmail";
import type { EmailOutcome } from "@/lib/timesheetEmail";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Job emails with progressive disclosure. These emails carry the restricted summary only (title, date and time, format,
 * generic setting, role, broad program type), and no reference: the subject names the job by its date. Addresses, prep notes and materials are never emailed;
 * after acceptance they are on the secure details page that the confirmation links to.
 *
 * SERVER ONLY.
 */

/**
 * The job's rows in an email. `withReference` adds the agency's APT reference, for STAFF emails only: an interpreter email never
 * carries a reference (the APT one is the agency's own, and the SRN is never emailed), it names the job by its date instead.
 */
export const summaryRows = (s: JobSummary, opts: { withReference?: boolean } = {}) => [
  ...(opts.withReference ? [{ label: "Reference", value: s.reference }] : []),
  { label: "Assignment", value: s.emailTitle },
  { label: "Date", value: s.dateLabel },
  { label: "Time", value: s.timeLabel },
  { label: "Format", value: s.format },
  { label: "Setting", value: s.setting },
  { label: "Role", value: s.role },
  { label: "Program", value: s.program },
];

export const summaryText = (s: JobSummary, opts: { withReference?: boolean } = {}) => summaryRows(s, opts).map((r) => `${r.label}: ${r.value}`).join("\n");

/** How an interpreter email names its job: "Job offer · Tue, Nov 18". */
export const interpreterEmailTitle = (prefix: string, s: JobSummary): string => `${prefix} · ${s.shortDate}`;

/**
 * The offer email: restricted details plus Accept / Decline links. `deadline` is the offer's response deadline in the job's zone
 * (lib/offerDeadline.ts); the links last exactly that long.
 */
export function buildOfferEmail(s: JobSummary, acceptUrl: string, declineUrl: string, deadline: string | null): { subject: string; html: string; text: string } {
  const locationNote = s.isVirtual
    ? "The meeting link is shared after you accept."
    : "The exact location is shared after you accept.";
  const respond = deadline ? `Please respond by ${deadline}.` : "Please respond as soon as you can.";
  const html = buildTerpDeskEmail({
    title: interpreterEmailTitle("Job offer", s),
    preheader: `A new interpreting job offer for ${s.dateLabel}. Please respond promptly.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You have a new job offer</h1>
      <p style="margin:0 0 4px;">Review the details below and respond. ${escapeHtml(locationNote)} Appointment notes and materials follow once you're booked.</p>
      ${emailActionCard(`
        ${emailDetailsTable(summaryRows(s))}
        <p style="margin:20px 0 12px;">${emailButton("Accept job offer", acceptUrl)}</p>
        <p style="margin:0;">${emailSecondaryButton("Decline offer", declineUrl)}</p>
      `)}
      <p style="margin:0;font-size:13px;color:#6B7280;">No password is needed. ${escapeHtml(respond)}</p>`,
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
    `No password is needed. ${respond}`,
  ].join("\n");
  return { subject: `${interpreterEmailTitle("Job offer", s)} - terpDESK`, html, text };
}

/** "accepted": the interpreter said yes. "assigned": agency staff booked them directly, so there is nothing to answer. */
export type ConfirmationKind = "accepted" | "assigned";

const CONFIRMATION_COPY: Record<ConfirmationKind, { title: string; heading: string; intro: string; subject: string }> = {
  accepted: { title: "Booking confirmed", heading: "You're booked", intro: "Thanks for accepting. Here is your booking.", subject: "Booking confirmed" },
  assigned: {
    title: "Job assigned",
    heading: "You've been assigned to a job",
    intro: "Your agency has booked you for this job, so there is nothing to accept. Here is your booking.",
    subject: "Job assigned",
  },
};

export function buildConfirmationEmail(s: JobSummary, name: string, detailsUrl: string | null, kind: ConfirmationKind = "accepted"): { subject: string; html: string; text: string } {
  const copy = CONFIRMATION_COPY[kind];
  const detailsBlock = detailsUrl
    ? `<p style="margin:20px 0 8px;">${emailButton("View full job details", detailsUrl)}</p>
       <p style="margin:0;font-size:13px;color:#6B7280;">The exact location or meeting link, program, appointment notes and prep materials are on this private page (no password needed). Prep materials are also in the terpDESK app.</p>`
    : `<p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Sign in to terpDESK to see the location, appointment notes and prep materials.</p>`;
  const html = buildTerpDeskEmail({
    title: interpreterEmailTitle(copy.title, s),
    preheader: `You're booked for ${s.dateLabel}.`,
    bodyContent: `
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${copy.heading}${name ? `, ${escapeHtml(name)}` : ""}</h1>
      <p style="margin:0 0 4px;">${copy.intro}</p>
      ${emailActionCard(`${emailDetailsTable(summaryRows(s))}${detailsBlock}`)}
      <p style="margin:0;font-size:13px;color:#6B7280;">For your clients' privacy, location and preparation details are never sent by email. Please don't forward this message.</p>`,
  });
  const text = [
    `${copy.heading}${name ? `, ${name}` : ""}.`,
    "",
    ...(kind === "assigned" ? [copy.intro, ""] : []),
    summaryText(s),
    "",
    detailsUrl
      ? `Full job details (location, program, appointment notes, prep materials): ${detailsUrl}`
      : "Sign in to terpDESK to see the location, appointment notes and prep materials.",
    "",
    "For your clients' privacy, location and preparation details are never sent by email.",
  ].join("\n");
  return { subject: `${interpreterEmailTitle(copy.subject, s)} - terpDESK`, html, text };
}

/** The external portal where ODHH interpreters report the assignment (kept exactly as the state publishes it). */
export const ODHH_ASSIGNMENT_REPORT_URL = ODHH_VERIFICATION_FORM_URL;

/**
 * "Post-Job Action Required" for an ODHH job that has ended: submit the hours in the state portal.
 * Restricted summary only (no address, client or notes). Throws if the email cannot be sent, so the caller can retry.
 */
export async function sendOdhhPostJobReminder(params: { to: string; name: string; summary: JobSummary }): Promise<void> {
  const s = params.summary;
  const html = buildTerpDeskEmail({
    title: interpreterEmailTitle("Post-job action required", s),
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
  await sendEmail(params.to, `Post-job action required: submit your ODHH hours (${s.shortDate})`, html, text);
}

/**
 * Sends the booking confirmation after an interpreter accepts (in the app or through the email link), is assigned
 * directly, or when staff choose "Resend details". Never throws: a failed email must not undo or block the booking.
 * Returns what happened to the email ("failed" = it could not be built or SES refused it).
 */
export async function sendBookingConfirmation(params: { requestId: string; interpreterId: string; positionNumber?: number; kind?: ConfirmationKind }): Promise<EmailOutcome | "failed"> {
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
    if (!request || !interpreter?.email) return "failed";

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

    const email = buildConfirmationEmail(summary, name, detailsUrl, params.kind);
    const outcome = await sendEmail(interpreter.email, email.subject, email.html, email.text);
    if (outcome === "sent") {
      await writeAuditLog({
        action: "booking_confirmation_sent",
        details: `requestId=${request.id}; interpreterId=${params.interpreterId}`,
      });
    }
    return outcome;
  } catch {
    // Never log the error object here: it can include the recipient address.
    console.error("[jobEmails] could not send the booking confirmation");
    return "failed";
  }
}
