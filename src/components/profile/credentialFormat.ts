import { formatInTimeZone } from "date-fns-tz";
import type { MyCredential } from "@/lib/validation/credential";
import { getIanaZone } from "@/utils/timezone";

const EXPIRING_SOON_DAYS = 60;

export const badgeBase = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";
export const neutralBadge = `${badgeBase} border-stone-200 bg-white text-gray-600`;
export const actionButton =
  "rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";
export const dangerButton =
  "rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60";

/** "2026-03-09" -> "Mar 9, 2026" without shifting the day through a time zone. */
export const formatDay = (value: string): string => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/** A yyyy-MM-dd calendar date as a whole day count (no clock time, so no time zone can shift it). */
const dayNumber = (value: string): number => {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Expired / expiring-soon badge. "Today" is the calendar date in the interpreter's own time zone, never the
 * server's (UTC) or the viewer's browser zone, so an agency in another zone sees the same answer the interpreter does.
 * A credential is still valid on its expiration date and expired from the next day.
 */
export const expiryStatus = (
  expirationDate: string,
  timeZone: string,
  now: Date = new Date(),
): { label: string; className: string } | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) return null;
  const today = formatInTimeZone(now, getIanaZone(timeZone), "yyyy-MM-dd");
  const days = dayNumber(expirationDate) - dayNumber(today);
  if (days < 0) return { label: "Expired", className: "border-red-200 bg-red-50 text-red-700" };
  if (days <= EXPIRING_SOON_DAYS) return { label: "Expires soon", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return null;
};

/** The "Issued by … · No. …" and "Issued … · Expires …" lines under a credential's name. */
export const credentialLines = (c: MyCredential): { details: string[]; dates: string[] } => ({
  details: [c.issuedBy && `Issued by ${c.issuedBy}`, c.credentialNumber && `No. ${c.credentialNumber}`].filter(Boolean) as string[],
  dates: [c.issueDate && `Issued ${formatDay(c.issueDate)}`, c.expirationDate && `Expires ${formatDay(c.expirationDate)}`].filter(Boolean) as string[],
});
