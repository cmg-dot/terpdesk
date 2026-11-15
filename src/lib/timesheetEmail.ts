import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import {
  buildTerpDeskEmail,
  emailActionCard,
  emailButton,
  emailDetailsTable,
  escapeHtml,
} from "@/lib/emailTemplate";
import { checkRecipient } from "@/lib/emailGate";
import type { RecipientDecision } from "@/lib/emailGate";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";

/**
 * Production sends as ASL Professionals' dispatch address. Another deployment (the demo) sets EMAIL_FROM_ADDRESS to its own
 * SES-verified sender, so its mail, and any reply to it, never involves the agency's real mailbox.
 */
const SENDER = process.env.EMAIL_FROM_ADDRESS?.trim() || "dispatch@aslprofessionals.net";

/**
 * What happened to an email: "sent" (handed to SES), "muted" (the agency has this interpreter's email notifications off),
 * or "suppressed" (silent mode, a placeholder address, no demo sender, not on EMAIL_ALLOWLIST, or the gate check failed).
 */
export type EmailOutcome = "sent" | "muted" | "suppressed";

export interface SendEmailOptions {
  /** "account": self-triggered sign-up verification or a two-step security notice. Skips the per-recipient gate only. */
  purpose?: "operational" | "account";
}

export const sendEmail = async (to: string, subject: string, html: string, text: string, options: SendEmailOptions = {}): Promise<EmailOutcome> => {
  // Global Silent Mode: a server-only switch (read at call time) that suppresses every outbound email, e.g. during a bulk import.
  if (process.env.EMAIL_SILENT_MODE === "true") {
    console.log("Silent mode active: Email suppressed");
    return "suppressed";
  }
  // Bulk-imported people with no email on file hold a placeholder on a reserved domain: never send to it.
  if (isPlaceholderEmail(to)) return "suppressed";
  // The demo deployment must never send as the production agency: without its own sender it sends nothing at all.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && !process.env.EMAIL_FROM_ADDRESS?.trim()) {
    console.warn("Demo mode without EMAIL_FROM_ADDRESS: email suppressed");
    return "suppressed";
  }
  if (options.purpose !== "account") {
    let decision: RecipientDecision;
    try {
      decision = await checkRecipient(to);
    } catch {
      // Fail closed. Never log the error object: it can include the recipient address.
      console.error("[sendEmail] recipient check failed: email suppressed");
      return "suppressed";
    }
    if (decision === "muted") {
      console.log("Email notifications are off for this interpreter: email suppressed");
      return "muted";
    }
    if (decision === "not_allowlisted") {
      console.log("Recipient is not on EMAIL_ALLOWLIST: email suppressed");
      return "suppressed";
    }
  }
  const ses = new SESClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2",
  });
  await ses.send(
    new SendEmailCommand({
      Source: SENDER,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }),
  );
  return "sent";
};

// ---------------------------------------------------------------------------
// Timesheet request (magic link)
// ---------------------------------------------------------------------------

export interface TimesheetEmailParams {
  to: string;
  interpreterName: string;
  /** Pre-formatted appointment date, e.g. "March 4, 2026". */
  dateLabel: string;
  /** "Virtual" or "On-site" only — no venue or address. */
  formatLabel: string;
  link: string;
  expiryDays: number;
}

/** Sends the timesheet magic link. Content is deliberately free of PHI. */
export const sendTimesheetEmail = (p: TimesheetEmailParams): Promise<EmailOutcome> => {
  const subject = `Timesheet Request for Assignment on ${p.dateLabel}`;
  const expiry = `No login is required. This link expires in ${p.expiryDays} days and can be used once.`;

  const bodyContent = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Submit your hours</h1>
    <p style="margin:0 0 12px;">Hello ${escapeHtml(p.interpreterName)},</p>
    <p style="margin:0 0 12px;">Please submit your hours and signature for your assignment on <strong>${escapeHtml(p.dateLabel)}</strong> (${escapeHtml(p.formatLabel)}).</p>
    ${emailActionCard(`<p style="margin:0;">${emailButton("Submit Hours", p.link)}</p>`)}
    <p style="margin:0;font-size:13px;color:#6B7280;">${escapeHtml(expiry)}</p>`;

  const html = buildTerpDeskEmail({
    title: subject,
    preheader: `Submit your hours for the assignment on ${p.dateLabel}.`,
    bodyContent,
  });
  const text = [
    `Hello ${p.interpreterName},`,
    "",
    `Please submit your hours and signature for your assignment on ${p.dateLabel} (${p.formatLabel}).`,
    "",
    `Submit hours: ${p.link}`,
    "",
    expiry,
  ].join("\n");

  return sendEmail(p.to, subject, html, text);
};

// ---------------------------------------------------------------------------
// Approved hours receipt
// ---------------------------------------------------------------------------

export const ODHH_PORTAL_NOTE =
  "Your hours are approved by TerpDesk. Do not forget to copy these exact hours into the state ODHH portal to ensure you are paid.";

export interface ApprovalEmailParams {
  to: string;
  interpreterName: string;
  dateLabel: string;
  approvedHours: string;
  approvedMileage: string;
  isOdhh: boolean;
  /** Number of mileage legs recorded. Counts only: no labels, notes or reasons (PHI). */
  travelLegCount?: number;
}

/** Receipt sent after approval. Date, hours and mileage only; no PHI. */
export const sendApprovalEmail = (p: ApprovalEmailParams): Promise<EmailOutcome> => {
  const subject = `Hours Approved for Assignment on ${p.dateLabel}`;
  const rows = [
    { label: "Assignment date", value: p.dateLabel },
    { label: "Approved hours", value: p.approvedHours },
    { label: "Approved mileage", value: `${p.approvedMileage} mi` },
  ];
  if (p.travelLegCount) {
    rows.push({
      label: "Travel legs recorded",
      value: `${p.travelLegCount} travel ${p.travelLegCount === 1 ? "leg" : "legs"}`,
    });
  }

  const bodyContent = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Your hours are approved</h1>
    <p style="margin:0 0 12px;">Hello ${escapeHtml(p.interpreterName)},</p>
    <p style="margin:0 0 4px;">Your timesheet for the assignment on <strong>${escapeHtml(p.dateLabel)}</strong> has been approved.</p>
    ${emailActionCard(emailDetailsTable(rows))}
    ${p.isOdhh ? `<p style="margin:0;"><strong>${escapeHtml(ODHH_PORTAL_NOTE)}</strong></p>` : ""}`;

  const html = buildTerpDeskEmail({
    title: subject,
    preheader: `Your hours for the assignment on ${p.dateLabel} are approved.`,
    bodyContent,
  });

  const lines = [
    `Hello ${p.interpreterName},`,
    "",
    `Your timesheet for the assignment on ${p.dateLabel} has been approved.`,
    ...rows.slice(1).map((r) => `${r.label}: ${r.value}`),
  ];
  if (p.isOdhh) lines.push("", ODHH_PORTAL_NOTE);

  return sendEmail(p.to, subject, html, lines.join("\n"));
};
