import { escapeHtml } from "@/lib/emailTemplate";
import type { JobSummary } from "@/lib/jobSummary";
import { MAX_AVAILABILITY_NOTE } from "@/lib/acceptAnswers";
import { offerDeadlineLabel } from "@/lib/offerDeadline";

/**
 * The page an Accept / Decline email link opens. It changes nothing by itself: the button posts to the same
 * address, and only that POST books or declines. Shows the restricted summary only (no address, program or notes).
 */
const FIELD = "width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;font-size:14px;margin-top:4px;";

/**
 * Accepting asks what the app asks (lib/acceptAnswers.ts): "Do you need travel time?" (required) with hours and minutes, and an
 * optional availability note. Plain form fields, no script; the server checks the answers and shows this page again on a problem.
 */
const acceptQuestions = (): string => `
    <fieldset style="border:0;padding:0;margin:20px 0 0;">
      <legend style="font-size:14px;font-weight:600;margin-bottom:8px;">Do you need travel time?</legend>
      <label style="margin-right:18px;font-size:14px;"><input type="radio" name="travel" value="yes" required> Yes</label>
      <label style="font-size:14px;"><input type="radio" name="travel" value="no" required> No</label>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <label style="flex:1;font-size:12px;color:#64748b;">If yes, hours<input name="travelHours" inputmode="numeric" maxlength="2" style="${FIELD}"></label>
        <label style="flex:1;font-size:12px;color:#64748b;">and minutes<input name="travelMinutes" inputmode="numeric" maxlength="2" style="${FIELD}"></label>
      </div>
    </fieldset>
    <label style="display:block;margin-top:14px;font-size:14px;font-weight:600;">Availability note <span style="font-weight:400;color:#64748b;">(optional)</span>
      <input name="availabilityNote" maxlength="${MAX_AVAILABILITY_NOTE}" placeholder="e.g. Available 10:00-11:00 AM only" style="${FIELD}font-weight:400;">
    </label>`;

export function renderOfferConfirmPage(params: { token: string; action: "accept" | "decline"; summary: JobSummary; expiresAt: Date; error?: string }): Response {
  const { token, action, summary: s } = params;
  const accepting = action === "accept";
  const deadline = offerDeadlineLabel(params.expiresAt, s.timeZone);
  // No reference: the page is opened from an email link, so it shows what the email does (the APT reference is staff-only).
  const rows: [string, string][] = [
    ...(deadline ? [["Respond by", deadline] satisfies [string, string]] : []),
    ["Assignment", s.emailTitle],
    ["Date", s.dateLabel],
    ["Time", s.timeLabel],
    ["Format", s.format],
    ["Setting", s.setting],
    ["Role", s.role],
    ["Program", s.program],
  ];
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;font-weight:600;font-size:14px;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${accepting ? "Accept" : "Decline"} job offer | terpDESK</title></head>
<body style="margin:0;background:#F9F8F4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
<div style="max-width:480px;margin:8vh auto;padding:0 16px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <h1 style="margin:0 0 6px;font-size:20px;">${accepting ? "Accept this job offer?" : "Decline this job offer?"}</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">${
      accepting
        ? "Nothing is booked until you confirm below. The exact location and preparation details are shared after you accept."
        : "Nothing changes until you confirm below."
    }</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #f1f5f9;">${rowsHtml}</table>
    <form method="POST" action="/api/offers/response" style="margin-top:20px;">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <input type="hidden" name="action" value="${action}">
      ${accepting ? acceptQuestions() : ""}
      ${params.error ? `<p role="alert" style="margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#FEF2F2;color:#B91C1C;font-size:13px;">${escapeHtml(params.error)}</p>` : ""}
      <div style="height:16px;"></div>
      <button type="submit" style="width:100%;border:0;border-radius:999px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer;color:${
        accepting ? "#fff" : "#0B3B32"
      };background:${accepting ? "#0B3B32" : "#fff"};${accepting ? "" : "border:1px solid #0B3B32;"}">${
        accepting ? "Yes, accept this job" : "Yes, decline this offer"
      }</button>
    </form>
  </div>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}
