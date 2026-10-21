import { escapeHtml } from "@/lib/emailTemplate";
import type { JobSummary } from "@/lib/jobSummary";

/**
 * The page an Accept / Decline email link opens. It changes nothing by itself: the button posts to the same
 * address, and only that POST books or declines. Shows the restricted summary only (no address, program or notes).
 */
export function renderOfferConfirmPage(params: { token: string; action: "accept" | "decline"; summary: JobSummary }): Response {
  const { token, action, summary: s } = params;
  const accepting = action === "accept";
  const rows: [string, string][] = [
    ["Reference", s.reference],
    ["Assignment", s.title],
    ["Date", s.dateLabel],
    ["Time", s.timeLabel],
    ["Format", s.format],
    ["Setting", s.setting],
    ["Role", s.role],
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
