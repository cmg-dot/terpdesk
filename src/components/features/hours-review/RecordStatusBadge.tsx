import type { ServiceRecord } from "@/utils/hoursReviewRecords";

const BADGE = "px-3 py-1 text-[12px] font-medium rounded-full whitespace-nowrap";

/** "Awaiting review", "Approved", "Correction requested" or "Draft" for a record (nothing for a state that has no badge). */
export function RecordStatusBadge({ state }: { state: ServiceRecord["state"] }) {
  if (state === "submitted" || state === "awaiting_review") return <span className={`${BADGE} bg-purple-100 text-purple-700`}>Awaiting review</span>;
  if (state === "approved") return <span className={`${BADGE} bg-green-100 text-green-700`}>Approved</span>;
  if (state === "changes_requested" || state === "correction_requested") return <span className={`${BADGE} bg-orange-100 text-orange-700`}>Correction requested</span>;
  if (state === "draft") return <span className={`${BADGE} bg-gray-100 text-gray-700`}>Draft</span>;
  return null;
}
