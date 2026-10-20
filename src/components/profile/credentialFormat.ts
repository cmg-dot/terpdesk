import type { MyCredential } from "@/lib/validation/credential";

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

export const expiryStatus = (expirationDate: string): { label: string; className: string } | null => {
  if (!expirationDate) return null;
  const [y, m, d] = expirationDate.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Expired", className: "border-red-200 bg-red-50 text-red-700" };
  if (days <= EXPIRING_SOON_DAYS) return { label: "Expires soon", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return null;
};

/** The "Issued by … · No. …" and "Issued … · Expires …" lines under a credential's name. */
export const credentialLines = (c: MyCredential): { details: string[]; dates: string[] } => ({
  details: [c.issuedBy && `Issued by ${c.issuedBy}`, c.credentialNumber && `No. ${c.credentialNumber}`].filter(Boolean) as string[],
  dates: [c.issueDate && `Issued ${formatDay(c.issueDate)}`, c.expirationDate && `Expires ${formatDay(c.expirationDate)}`].filter(Boolean) as string[],
});
