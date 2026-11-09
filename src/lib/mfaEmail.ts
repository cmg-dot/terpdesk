import { buildTerpDeskEmail } from "@/lib/emailTemplate";
import { sendEmail } from "@/lib/timesheetEmail";

/**
 * The plain security notice sent when two-step verification is turned on or off, or the recovery codes are replaced, so a change
 * nobody asked for is noticed. SERVER ONLY. Contains no appointment or client information and no codes. Best effort: a mail
 * problem never undoes or blocks the change (the audit log is the record).
 */

export type MfaChange = "enabled" | "disabled" | "recovery_regenerated";

const COPY: Record<MfaChange, { subject: string; line: string }> = {
  enabled: { subject: "Two-step verification was turned on", line: "Two-step verification was turned on for your terpDESK account." },
  disabled: { subject: "Two-step verification was turned off", line: "Two-step verification was turned off for your terpDESK account." },
  recovery_regenerated: { subject: "New recovery codes were created", line: "New recovery codes were created for your terpDESK account. Your old recovery codes no longer work." },
};

export async function sendMfaChangedEmail(to: string, change: MfaChange): Promise<void> {
  const { subject, line } = COPY[change];
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${subject}</h1>
    <p style="margin:0 0 12px;">${line}</p>
    <p style="margin:0;font-size:13px;color:#6B7280;">If you did not do this, sign in and change your password, then contact your terpDESK administrator.</p>`;
  const html = buildTerpDeskEmail({ title: subject, preheader: line, bodyContent: body });
  const text = [line, "", "If you did not do this, sign in and change your password, then contact your terpDESK administrator."].join("\n");
  try {
    await sendEmail(to, subject, html, text);
  } catch {
    // Not worth failing the change over; the audit log has it.
  }
}
