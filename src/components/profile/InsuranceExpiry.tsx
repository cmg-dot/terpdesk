import { badgeBase, expiryStatus, formatDay } from "@/components/profile/credentialFormat";

/** A liability insurance expiration date ("Mar 9, 2026") with an Expired / Expires soon badge, judged in the interpreter's zone. */
export const InsuranceExpiry = ({ date, timeZone }: { date: string; timeZone: string }) => {
  if (!date) return <span className="text-gray-400">Not set</span>;
  const status = expiryStatus(date, timeZone);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 sm:justify-end">
      {formatDay(date)}
      {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
    </span>
  );
};
