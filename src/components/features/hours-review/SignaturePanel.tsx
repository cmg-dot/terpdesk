import { SignatureImage } from "@/components/features/SignatureImage";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/** The service-verification signature on a record, or why there is none. */
export function SignaturePanel({ record }: { record: ServiceRecord }) {
  if (record.signatureDataUrl) {
    return (
      <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mb-6">
        <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Service-verification signature</h4>
        <SignatureImage src={record.signatureDataUrl} alt="Service-verification signature" />
      </div>
    );
  }
  const awaiting = record.state === 'submitted' || record.state === 'awaiting_review';
  return (
    <div className="bg-[#F5F4F0] p-4 md:p-5 rounded-xl mb-6">
      <h4 className="text-sm font-medium text-[var(--ink)] mb-1">Service-verification signature</h4>
      <p className="text-sm text-[var(--sage)]">{awaiting ? "No signature has been collected yet." : "No signature image is on file for this record."}</p>
    </div>
  );
}
