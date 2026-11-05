import { MileageApprovalField } from "@/components/features/MileageApprovalField";
import type { ReviewActionsState } from "@/hooks/useReviewActions";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/** The agency's review panel on a record awaiting review: signature exception, mileage to approve, correction message, and the two buttons. */
export function ReviewActions({ record, review }: { record: ServiceRecord; review: ReviewActionsState }) {
  if (record.state !== 'submitted' && record.state !== 'awaiting_review') return null;
  return (
    <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl">
      {!record.signatureDataUrl && (
      <label className="flex items-start gap-3 cursor-pointer mb-6">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--forest)] focus:ring-[#0B3B32]"
          checked={review.hasException}
          onChange={(e) => {
            review.setHasException(e.target.checked);
            review.setShowSignatureError(false);
          }}
        />
        <span className="text-sm text-gray-700">Record a signature exception (demo bypass)</span>
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
      <div className="mb-5">
        <label className="block text-xs text-gray-600 mb-2">Message to the interpreter (required to request a correction)</label>
        <textarea
          rows={4}
          value={review.correctionText}
          onChange={(e) => {
            review.setCorrectionText(e.target.value);
            review.setShowCorrectionError(false);
          }}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow resize-none"
        ></textarea>
        {review.showCorrectionError && <p className="text-[#C23B22] text-xs mt-1">Say what needs correcting so the interpreter can fix it</p>}
      </div>
      {review.showSignatureError && <p className="text-[#C23B22] text-sm mb-4">This assignment needs a service-verification signature, or a recorded exception, before it can be approved</p>}
      {review.approveError && <p className="text-[#C23B22] text-sm mb-4" role="alert">{review.approveError}</p>}
      <div className="flex flex-col sm:flex-row gap-3 w-full mb-4">
        <button
          onClick={review.handleApprove}
          disabled={review.isApproving}
          className="w-full sm:w-auto bg-[#145347] text-white hover:bg-[#0f4037] rounded-full px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {review.isApproving ? 'Approving…' : 'Approve service record'}
        </button>
        <button
          onClick={review.handleRequestCorrection}
          className="w-full sm:w-auto bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full px-6 py-2.5 text-sm font-medium transition-colors"
        >
          Request a correction
        </button>
      </div>
      <p className="text-xs text-[var(--sage)] leading-relaxed">
        Approving confirms what was worked and the mileage the agency accepts. It does not calculate pay, rates or an invoice, and it never overwrites what the interpreter submitted.
      </p>
    </div>
  );
}
