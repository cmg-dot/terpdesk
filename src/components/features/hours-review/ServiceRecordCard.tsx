"use client";

import { useId, useState } from "react";
import { RecordDetails } from "@/components/features/hours-review/RecordDetails";
import { RecordSummaryRow } from "@/components/features/hours-review/RecordSummaryRow";
import { ReviewActions } from "@/components/features/hours-review/ReviewActions";
import { SignaturePanel } from "@/components/features/hours-review/SignaturePanel";
import { VersionHistory } from "@/components/features/hours-review/VersionHistory";
import { useReviewActions } from "@/hooks/useReviewActions";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/**
 * One hours record on the review page. It is a single summary row until it is opened; opening shows the full details, the
 * signature and (while awaiting review) the agency's approve / correct panel.
 */
export function ServiceRecordCard({ record, onUpdate }: { record: ServiceRecord; onUpdate: (r: ServiceRecord) => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  // Kept here, not in the panel, so a half-written correction or a typed mileage survives closing and reopening the row.
  const review = useReviewActions(record, onUpdate);

  return (
    <article data-hours-record={record.id} className="rounded-2xl border border-gray-200 bg-white">
      <RecordSummaryRow record={record} expanded={expanded} onToggle={() => setExpanded((open) => !open)} panelId={panelId} />
      {expanded && (
        <div id={panelId} className="border-t border-gray-100 p-6 sm:p-8">
          <RecordDetails record={record} />
          <VersionHistory record={record} />
          <SignaturePanel record={record} />
          <ReviewActions record={record} review={review} />
        </div>
      )}
    </article>
  );
}
