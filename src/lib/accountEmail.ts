import { buildTerpDeskEmail, emailActionCard, emailButton, escapeHtml } from "@/lib/emailTemplate";
import { sendEmail } from "@/lib/timesheetEmail";

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

  await sendEmail(params.to, subject, html, text);
}
