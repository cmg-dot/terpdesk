"use client";

import { CardHeader } from "@/components/features/hours-review/CardHeader";
import { RecordDetails } from "@/components/features/hours-review/RecordDetails";
import { ReviewActions } from "@/components/features/hours-review/ReviewActions";
import { SignaturePanel } from "@/components/features/hours-review/SignaturePanel";
import { VersionHistory } from "@/components/features/hours-review/VersionHistory";
import { useReviewActions } from "@/hooks/useReviewActions";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/** One hours record on the review page: what was reported, its signature, and (while awaiting review) the agency's approve / correct panel. */
export function ServiceRecordCard({ record, onUpdate }: { record: ServiceRecord; onUpdate: (r: ServiceRecord) => void }) {
  // Kept here, not in the panel, so a half-written correction survives while the panel is hidden and shown again.
  const review = useReviewActions(record, onUpdate);

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 mb-4">
      <CardHeader record={record} />
      <RecordDetails record={record} />
      <VersionHistory record={record} />
      <SignaturePanel record={record} />
      <ReviewActions record={record} review={review} />
    </div>
  );
}
