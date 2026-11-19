import { CalendarX } from "lucide-react";

const PILL = "inline-flex h-6 items-center gap-1 text-xs font-medium px-2.5 rounded-full whitespace-nowrap shrink-0";

/**
 * "Cancelled · billable" (amber) or "Cancelled · not billable" (grey) on an interpreter's cancelled booking. Shown only where billing
 * is switched on (the verdict is not sent anywhere else), so production is unchanged until sign-off.
 */
export function CancellationPill({ billable }: { billable: boolean }) {
  return (
    <span className={`${PILL} ${billable ? "border border-amber-300 bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"}`} data-cancellation-pill={billable ? "billable" : "not_billable"}>
      <CalendarX className="h-3 w-3" aria-hidden="true" />
      {billable ? "Cancelled · billable" : "Cancelled · not billable"}
    </span>
  );
}
