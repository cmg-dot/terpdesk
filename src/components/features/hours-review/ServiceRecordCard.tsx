"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RecordDetails } from "@/components/features/hours-review/RecordDetails";
import { RecordSummaryRow } from "@/components/features/hours-review/RecordSummaryRow";
import { ReviewActions } from "@/components/features/hours-review/ReviewActions";
import { SignaturePanel } from "@/components/features/hours-review/SignaturePanel";
import { VersionHistory } from "@/components/features/hours-review/VersionHistory";
import { VerificationPdfButton } from "@/components/features/VerificationPdfButton";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { useReviewActions } from "@/hooks/useReviewActions";
import { PANEL } from "@/lib/hoursMotion";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/**
 * One hours record on the review page. It is a single summary row until it is opened; opening shows the full details, the
 * signature and (while awaiting review) the agency's approve / correct panel. The panel opens and closes by height with a short fade.
 */
export function ServiceRecordCard({ record, onUpdate }: { record: ServiceRecord; onUpdate: (r: ServiceRecord) => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  // Kept here, not in the panel, so a half-written correction or a typed mileage survives closing and reopening the row.
  const review = useReviewActions(record, onUpdate);
  const { transition } = useHoursMotion();

  return (
    <article data-hours-record={record.id} className="rounded-2xl border border-gray-200 bg-white">
      <RecordSummaryRow record={record} expanded={expanded} onToggle={() => setExpanded((open) => !open)} panelId={panelId} />
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key="panel" id={panelId} initial={PANEL.initial} animate={PANEL.animate} exit={PANEL.exit} transition={transition()}>
            <div className="border-t border-gray-100 p-6 sm:p-8">
              <RecordDetails record={record} />
              <VersionHistory record={record} />
              <SignaturePanel record={record} />
              {record.pdfPosition !== undefined && <VerificationPdfButton requestId={record.appointmentId} position={record.pdfPosition} className="mb-6" />}
              <ReviewActions record={record} review={review} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
