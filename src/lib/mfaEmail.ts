import { buildTerpDeskEmail, escapeHtml } from "@/lib/emailTemplate";
import { sendEmail } from "@/lib/timesheetEmail";

/**
 * The plain security notice sent when two-step verification is turned on or off, an authenticator device is added or removed, or the
 * recovery codes are replaced, so a change nobody asked for is noticed. SERVER ONLY. Contains no appointment or client information
 * and no codes. Best effort: a mail problem never undoes or blocks the change (the audit log is the record).
 */

export type MfaChange = "enabled" | "disabled" | "recovery_regenerated" | "device_added" | "device_removed";

const COPY: Record<MfaChange, { subject: string; line: string }> = {
  enabled: { subject: "Two-step verification was turned on", line: "Two-step verification was turned on for your terpDESK account." },
  disabled: { subject: "Two-step verification was turned off", line: "Two-step verification was turned off for your terpDESK account." },
  recovery_regenerated: { subject: "New recovery codes were created", line: "New recovery codes were created for your terpDESK account. Your old recovery codes no longer work." },
  device_added: { subject: "An authenticator device was added", line: "A new authenticator device was added to your terpDESK account" },
  device_removed: { subject: "An authenticator device was removed", line: "An authenticator device was removed from your terpDESK account" },
};

const NOT_YOU = "If you did not do this, sign in and change your password, then contact your terpDESK administrator.";

/** `deviceLabel` is the person's own text for the device: it is escaped for the HTML part and never trusted as markup. */
export async function sendMfaChangedEmail(to: string, change: MfaChange, deviceLabel?: string): Promise<void> {
  const copy = COPY[change];
  const named = deviceLabel ? `${copy.line}: “${deviceLabel}”.` : copy.line.endsWith(".") ? copy.line : `${copy.line}.`;
  const namedHtml = deviceLabel ? `${escapeHtml(copy.line)}: “${escapeHtml(deviceLabel)}”.` : escapeHtml(named);
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${copy.subject}</h1>
    <p style="margin:0 0 12px;">${namedHtml}</p>
    <p style="margin:0;font-size:13px;color:#6B7280;">${NOT_YOU}</p>`;
  const html = buildTerpDeskEmail({ title: copy.subject, preheader: named, bodyContent: body });
  const text = [named, "", NOT_YOU].join("\n");
  try {
    await sendEmail(to, copy.subject, html, text);
  } catch {
    // Not worth failing the change over; the audit log has it.
  }
}
