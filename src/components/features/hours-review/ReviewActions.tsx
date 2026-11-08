import { useId } from "react";
import { MileageApprovalField } from "@/components/features/MileageApprovalField";
import type { ReviewActionsState } from "@/hooks/useReviewActions";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

const ERROR_BANNER = "mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700";
const PRIMARY = "w-full sm:w-auto bg-[#145347] text-white hover:bg-[#0f4037] rounded-full px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const SECONDARY = "w-full sm:w-auto bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * The agency's review panel on a record awaiting review: approve (with the mileage to approve), or request a correction. The
 * correction message box stays hidden until "Request a correction" is clicked.
 */
export function ReviewActions({ record, review }: { record: ServiceRecord; review: ReviewActionsState }) {
  const correctionId = useId();
  if (record.state !== 'submitted' && record.state !== 'awaiting_review') return null;
  return (
    <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl">
      {!record.signatureDataUrl && (
        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[var(--forest)]"
            checked={review.hasException}
            onChange={(e) => {
              review.setHasException(e.target.checked);
              review.setShowSignatureError(false);
            }}
          />
          <span>
            <span className="block text-sm text-gray-700">Approve without a signature</span>
            <span className="block text-xs text-[var(--sage)]">Tick this only when no signature could be collected.</span>
          </span>
        </label>
      )}
      <MileageApprovalField
        reported={record.reportedMileage ?? 0}
        value={review.mileageToApprove}
        onChange={(v) => { review.setMileageToApprove(v); review.setShowReasonError(false); }}
        reason={review.adjustmentReason}
        onReasonChange={(v) => { review.setAdjustmentReason(v); review.setShowReasonError(false); }}
        showValueError={review.showMileageError}
        showReasonError={review.showReasonError}
      />
      {review.isCorrecting && (
        <div className="mb-5">
          <label htmlFor={correctionId} className="block text-xs text-gray-600 mb-2">Message to the interpreter (required to request a correction)</label>
          <textarea
            id={correctionId}
            rows={3}
            autoFocus
            value={review.correctionText}
            onChange={(e) => {
              review.setCorrectionText(e.target.value);
              review.setShowCorrectionError(false);
            }}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[var(--forest)] outline-none transition-shadow resize-none"
          ></textarea>
          {review.showCorrectionError && <p className="text-[#C23B22] text-xs mt-1">Say what needs correcting so the interpreter can fix it</p>}
        </div>
      )}
      {review.showSignatureError && <p className="text-[#C23B22] text-sm mb-4">This assignment needs a service-verification signature, or approval without one, before it can be approved</p>}
      {review.approveError && <p className={ERROR_BANNER} role="alert">{review.approveError}</p>}
      {review.correctionError && <p className={ERROR_BANNER} role="alert">{review.correctionError}</p>}
      <div className="flex flex-col sm:flex-row gap-3 w-full mb-4">
        {review.isCorrecting ? (
          <>
            <button onClick={review.handleRequestCorrection} disabled={review.isSendingCorrection} className={PRIMARY}>
              {review.isSendingCorrection ? 'Sending…' : 'Send correction request'}
            </button>
            <button onClick={review.cancelCorrection} disabled={review.isSendingCorrection} className={SECONDARY}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={review.handleApprove} disabled={review.isApproving} className={PRIMARY}>
              {review.isApproving ? 'Approving…' : 'Approve service record'}
            </button>
            <button onClick={review.startCorrection} className={SECONDARY}>
              Request a correction
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-[var(--sage)] leading-relaxed">
        Approving confirms what was worked and the mileage the agency accepts. It does not calculate pay, rates or an invoice, and it never overwrites what the interpreter submitted.
      </p>
    </div>
  );
}
