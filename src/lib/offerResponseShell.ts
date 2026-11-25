/**
 * The one page shell every magic-link offer screen shares: the Accept / Decline confirmation gate, the receipt ("Offer Accepted",
 * "Offer Declined", "You're already booked") and the "Offer Expired or Invalid" page. Same background, card, dark green TerpDESK
 * header, icon circle, title and footer on all of them, so the three states read as one product. Pure: HTML text in, Response out.
 * Anything that comes from the database is escaped by the caller before it is passed in.
 */

export type ShellTone = "accepted" | "declined" | "expired" | "ask";

const TONES: Record<ShellTone, { circle: string; icon: string }> = {
  accepted: {
    circle: "#ecfdf5",
    icon: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  },
  declined: {
    circle: "#f1f5f9",
    icon: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
  expired: {
    circle: "#fffbeb",
    icon: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  },
  // The confirmation gate: a question, in the app's green.
  ask: {
    circle: "#e8f1ee",
    icon: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#163C3A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
};

const CSS = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background-color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background-color: #ffffff; max-width: 480px; width: 100%; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border: 1px solid #f3f4f6; overflow: hidden; text-align: center; }
    .header { background-color: #163C3A; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
    .header-title { color: #ffffff; font-size: 16px; font-weight: 700; letter-spacing: 0.025em; margin: 0; }
    .content { padding: 32px; }
    .icon-container { width: 72px; height: 72px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px; letter-spacing: -0.4px; }
    .message { font-size: 15px; color: #475569; line-height: 1.55; margin: 0; }
    .sub-notice { margin-top: 20px; font-size: 13px; color: #64748b; line-height: 1.5; }
    .body { text-align: left; }
    .btn { display: block; width: 100%; min-height: 48px; border-radius: 999px; padding: 12px 20px; font-size: 16px; font-weight: 600; line-height: 1.25; cursor: pointer; font-family: inherit; }
    .btn-primary { border: 2px solid #0B3B32; background: #0B3B32; color: #ffffff; }
    .btn-secondary { border: 2px solid #0B3B32; background: #ffffff; color: #0B3B32; }
    .btn:focus-visible { outline: 3px solid #163C3A; outline-offset: 3px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; }
    @media (max-width: 480px) { body { padding: 16px; } .content { padding: 24px 20px; } }`;

export const SHELL_FOOTER = "TerpDesk Dispatch Automation &bull; Secure Magic Link Response";

export interface ShellParams {
  tone: ShellTone;
  /** Already escaped (callers pass fixed text or escape it first). */
  title: string;
  message: string;
  /** The part under the message (job details, or the gate's place, table and form). Left-aligned. */
  bodyHtml?: string;
  subNotice?: string;
}

export function renderOfferShell({ tone, title, message, bodyHtml = "", subNotice }: ShellParams): Response {
  const { circle, icon } = TONES[tone];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${title} - TerpDesk</title>
  <style>${CSS}
  </style>
</head>
<body>
  <main class="card">
    <div class="header">
      <span class="header-title">TerpDESK</span>
    </div>
    <div class="content">
      <div class="icon-container" style="background-color: ${circle};">${icon}</div>
      <h1 class="title">${title}</h1>
      <p class="message">${message}</p>
      ${bodyHtml ? `<div class="body">${bodyHtml}</div>` : ""}
      ${subNotice ? `<div class="sub-notice">${subNotice}</div>` : ""}
    </div>
    <div class="footer">
      ${SHELL_FOOTER}
    </div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}
