import type { WebsiteRequestRow } from "@/lib/websiteRequests";

const CHIP = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold";

/** The status pill on a website request card, in the workspace theme's colours (the shared status badge has fixed ones). */
export function WebsiteStatusChip({ row }: { row: Pick<WebsiteRequestRow, "needsReview" | "statusLabel"> }) {
  if (row.needsReview) {
    return (
      <span className={`${CHIP} bg-[var(--tint)] text-[var(--tint-ink)]`} data-status-chip="needs-review">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--badge)]" aria-hidden="true" />
        {row.statusLabel}
      </span>
    );
  }
  const closed = ["Cancelled", "Voided", "Returned"].includes(row.statusLabel);
  return (
    <span className={`${CHIP} ${closed ? "bg-slate-100 text-slate-600" : "bg-[var(--surface)] text-[var(--forest)]"}`} data-status-chip="handled">
      {row.statusLabel}
    </span>
  );
}
