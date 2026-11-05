import Link from "next/link";
import { formatReference } from "@/utils/statusEngine";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

/** The top of a review card: the job's title and reference, the interpreter, the link to the appointment and the status badge. */
export function CardHeader({ record }: { record: ServiceRecord }) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        <h2 className="font-semibold text-lg text-[var(--ink)]">{record.title || record.reference || formatReference(record.appointmentId)}{record.positionIndex ? ` · Position ${record.positionIndex}` : ''}</h2>
        {/* The reference sits under the title unless the title already says it (e.g. "ODHH SRN #202786433"). */}
        <p className="mb-5 text-xs text-[var(--sage)]">{record.title && record.reference && !record.title.includes(record.reference.replace('SRN ', '')) ? record.reference : ' '}</p>
        <h3 className="font-medium text-[16px] text-[var(--ink)]">{record.interpreterName}</h3>
      </div>
      <div className="flex flex-col items-end gap-5">
        <Link href={`/requests/${record.appointmentId}`} className="text-sm underline text-gray-700 hover:text-[var(--ink)] transition-colors">
          Open appointment
        </Link>
        {(record.state === 'submitted' || record.state === 'awaiting_review') && (
           <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-purple-100 text-purple-700">Awaiting review</span>
        )}
        {record.state === 'approved' && (
           <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-green-100 text-green-700">Approved</span>
        )}
        {(record.state === 'changes_requested' || record.state === 'correction_requested') && (
           <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-orange-100 text-orange-700">Correction requested</span>
        )}
        {record.state === 'draft' && (
           <span className="px-3 py-1 text-[12px] font-medium rounded-full bg-gray-100 text-gray-700">Draft</span>
        )}
      </div>
    </div>
  );
}
