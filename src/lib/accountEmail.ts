import { buildTerpDeskEmail, emailActionCard, emailButton, escapeHtml } from "@/lib/emailTemplate";
import { sendEmail } from "@/lib/timesheetEmail";
import type { EmailOutcome } from "@/lib/timesheetEmail";

/**
 * Email that proves the person registering owns the address of an existing interpreter profile.
 * Contains no appointment or client information.
 */
export async function sendProfileClaimEmail(params: { to: string; name: string; link: string }): Promise<void> {
  const subject = "Verify your email to connect your interpreter profile";
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Verify your email</h1>
    <p style="margin:0 0 12px;">Hello ${escapeHtml(params.name)},</p>
    <p style="margin:0 0 4px;">An agency already has an interpreter profile for this email address. Confirm it is yours to connect it to your new account.</p>
    ${emailActionCard(`<p style="margin:0;">${emailButton("Verify my email", params.link)}</p>`)}
    <p style="margin:0;font-size:13px;color:#6B7280;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>`;

  const html = buildTerpDeskEmail({ title: subject, preheader: "Confirm your email to connect your profile.", bodyContent: body });
  const text = [
    `Hello ${params.name},`,
    "",
    "An agency already has an interpreter profile for this email address. Confirm it is yours to connect it to your new account.",
    "",
    `Verify my email: ${params.link}`,
    "",
    "This link expires in 24 hours. If you did not create an account, you can ignore this email.",
  ].join("\n");

  // Self-triggered (the person just signed up or asked for a new link): never muted by the agency's notification switch.
  await sendEmail(params.to, subject, html, text, { purpose: "account" });
}

/** The password reset link the person asked for on /reset-password. Self-triggered, so never muted. Returns what happened to it. */
export async function sendPasswordResetEmail(params: { to: string; name: string; link: string }): Promise<EmailOutcome> {
  const subject = "Reset your terpDESK password";
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Reset your password</h1>
    <p style="margin:0 0 12px;">Hello ${escapeHtml(params.name)},</p>
    <p style="margin:0 0 4px;">We received a request to reset the password for your terpDESK account. Choose a new password with the button below.</p>
    ${emailActionCard(`<p style="margin:0;">${emailButton("Choose a new password", params.link)}</p>`)}
    <p style="margin:0;font-size:13px;color:#6B7280;">This link expires in 60 minutes and works once. If you did not ask for this, you can ignore this email: your password stays the same.</p>`;

  const html = buildTerpDeskEmail({ title: subject, preheader: "Choose a new password for your terpDESK account.", bodyContent: body });
  const text = [
    `Hello ${params.name},`,
    "",
    "We received a request to reset the password for your terpDESK account.",
    "",
    `Choose a new password: ${params.link}`,
    "",
    "This link expires in 60 minutes and works once. If you did not ask for this, you can ignore this email: your password stays the same.",
  ].join("\n");

  return sendEmail(params.to, subject, html, text, { purpose: "account" });
}

/**
 * The notice after a password was reset by email link or changed in Settings, so a change nobody asked for is noticed. Best effort:
 * a mail problem never undoes the change (the audit log is the record). Contains no password and no link token.
 */
export async function sendPasswordChangedEmail(params: { to: string; name: string; via: "reset" | "settings"; resetUrl: string }): Promise<void> {
  const subject = "Your terpDESK password was changed";
  const what =
    params.via === "reset"
      ? "The password for your terpDESK account was just reset with an emailed link. Every device that was signed in has been signed out."
      : "The password for your terpDESK account was just changed in Settings. Every other device that was signed in has been signed out.";
  const notYou = "If you did not do this, reset your password now and contact your terpDESK administrator.";
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Your password was changed</h1>
    <p style="margin:0 0 12px;">Hello ${escapeHtml(params.name)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(what)}</p>
    <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">${escapeHtml(notYou)}</p>
    ${emailActionCard(`<p style="margin:0;">${emailButton("Reset my password", params.resetUrl)}</p>`)}`;
  const html = buildTerpDeskEmail({ title: subject, preheader: what, bodyContent: body });
  const text = [`Hello ${params.name},`, "", what, "", notYou, `Reset my password: ${params.resetUrl}`].join("\n");
  try {
    await sendEmail(params.to, subject, html, text, { purpose: "account" });
  } catch {
    console.error("[sendPasswordChangedEmail] could not send the notice");
  }
}
