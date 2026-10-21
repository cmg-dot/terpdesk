/**
 * Master HTML layout for every outgoing TerpDesk email. It mirrors the web cards: light gray page,
 * one white rounded card, solid brand-green header bar with a white text logo flush at the top.
 * Inline CSS only (Gmail strips <style> blocks) and no images (nothing for clients to block).
 */

export const EMAIL_COLORS = {
  /** Official TerpDesk brand green. */
  brand: "#163C3A",
  page: "#F9FAFB",
  card: "#FFFFFF",
  border: "#E5E7EB",
  text: "#1F2937",
  muted: "#6B7280",
} as const;

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface TerpDeskEmailInput {
  /** Document title. */
  title: string;
  /** Hidden inbox-preview text. */
  preheader: string;
  /** Trusted, pre-escaped HTML placed inside the card body. */
  bodyContent: string;
}

/** Soft inner box for the key data or actions inside the card. */
export const emailActionCard = (innerHtml: string): string =>
  `<div style="border:1px solid ${EMAIL_COLORS.border};border-radius:8px;padding:20px;margin:24px 0;text-align:center;background-color:${EMAIL_COLORS.page};">${innerHtml}</div>`;

/** Primary action button: brand green, white bold text. `href` and `label` are escaped here. */
export const emailButton = (label: string, href: string): string =>
  `<a href="${escapeHtml(href)}" target="_blank" style="background-color:${EMAIL_COLORS.brand};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px;font-family:${FONT_STACK};">${escapeHtml(label)}</a>`;

/**
 * Full-width, extra-large button for the one action an email exists for. Table-based ("bulletproof") so the whole
 * area stays a solid, clickable button in Outlook too.
 */
export const emailHeroButton = (label: string, href: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>` +
  `<td align="center" bgcolor="${EMAIL_COLORS.brand}" style="border-radius:10px;background-color:${EMAIL_COLORS.brand};">` +
  `<a href="${escapeHtml(href)}" target="_blank" style="display:block;padding:16px 24px;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;font-family:${FONT_STACK};border-radius:10px;">${escapeHtml(label)}</a>` +
  `</td></tr></table>`;

/** Secondary (outlined) button for a less prominent action. */
export const emailSecondaryButton = (label: string, href: string): string =>
  `<a href="${escapeHtml(href)}" target="_blank" style="background-color:#ffffff;color:${EMAIL_COLORS.brand};padding:11px 23px;border:1px solid ${EMAIL_COLORS.brand};border-radius:8px;text-decoration:none;display:inline-block;font-weight:700;font-size:15px;font-family:${FONT_STACK};">${escapeHtml(label)}</a>`;

/** Two-column label/value rows for neatly formatted details. Values are escaped here. */
export const emailDetailsTable = (rows: { label: string; value: string }[]): string => {
  const last = rows.length - 1;
  const body = rows
    .map((r, i) => {
      const rule = i === last ? "" : `border-bottom:1px solid ${EMAIL_COLORS.border};`;
      return (
        `<tr><td style="padding:10px 0;${rule}font-size:13px;color:${EMAIL_COLORS.muted};text-align:left;">${escapeHtml(r.label)}</td>` +
        `<td style="padding:10px 0;${rule}font-size:15px;font-weight:700;color:${EMAIL_COLORS.text};text-align:right;">${escapeHtml(r.value)}</td></tr>`
      );
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;">${body}</table>`;
};

export const buildTerpDeskEmail = ({ title, preheader, bodyContent }: TerpDeskEmailInput): string => {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.page};font-family:${FONT_STACK};color:${EMAIL_COLORS.text};">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_COLORS.page};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px;margin:40px auto;background-color:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background-color:${EMAIL_COLORS.brand};padding:16px 24px;text-align:left;">
            <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px;font-family:${FONT_STACK};">TerpDESK</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 24px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text};text-align:center;">
            ${bodyContent}
          </td>
        </tr>
        <tr>
          <td style="background-color:${EMAIL_COLORS.page};border-top:1px solid ${EMAIL_COLORS.border};padding:16px 24px;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center;">
            <p style="margin:0 0 4px;">You are receiving this email because you are registered with TerpDesk.</p>
            <p style="margin:0;">&copy; ${year} TerpDesk. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};
