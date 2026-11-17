import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import type { PayPeriod } from "@/lib/billing/payPeriods";

/** Display text for billing dates. Pure; client-safe. */

/** A yyyy-MM-dd as "Thu, Oct 15" (read at noon UTC so no zone can move the day). */
export const dayLabel = (date: string, pattern = "EEE, MMM d"): string => formatInTimeZone(`${date}T12:00:00Z`, "UTC", pattern);

/** "Nov 1 – 15, 2026" / "Oct 16 – Nov 2, 2026". */
export function periodLabel(p: Pick<PayPeriod, "start" | "end">): string {
  const sameMonth = p.start.slice(0, 7) === p.end.slice(0, 7);
  return `${dayLabel(p.start, "MMM d")} – ${dayLabel(p.end, sameMonth ? "d, yyyy" : "MMM d, yyyy")}`;
}

/** "Thu, Nov 19 · 12:00 PM PST" on the agency's clock. */
export const cutoffLabel = (iso: string): string => formatInTimeZone(iso, BUSINESS_ZONE, "EEE, MMM d · h:mm a zzz");

/** Business minutes of notice as "1 day 4 hr" (a business day being `dayMinutes` long). */
export function noticeLabel(minutes: number, dayMinutes: number): string {
  if (minutes <= 0) return "no notice";
  const days = Math.floor(minutes / dayMinutes);
  const hours = Math.round(((minutes % dayMinutes) / 60) * 10) / 10;
  const parts = [days > 0 ? `${days} business day${days === 1 ? "" : "s"}` : "", hours > 0 ? `${hours} hr` : ""].filter(Boolean);
  return parts.join(" ");
}
