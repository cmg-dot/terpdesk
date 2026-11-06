import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const PILL = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";

/**
 * The state request number an email is about, as a blue pill. When a job has that number the pill is a link straight to the
 * request, with a small "Open request" link beside it; when none does yet it is a plain grey pill saying so, so nobody clicks a
 * link that goes nowhere.
 */
export function InboxJobLink({ srn, jobId, showQuickLink = true, className = "" }: { srn: string | null; jobId: string | null; showQuickLink?: boolean; className?: string }) {
  if (!srn) return null;
  if (!jobId) return <span className={`${PILL} border-gray-200 bg-gray-50 text-gray-500 ${className}`}>SRN #{srn} · no job yet</span>;
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <Link
        href={`/requests/${jobId}`}
        data-inbox-job-link={srn}
        className={`${PILL} border-blue-200 bg-blue-50 text-blue-700 underline-offset-2 transition-colors hover:bg-blue-100 hover:text-blue-800 hover:underline`}
      >
        SRN #{srn}
      </Link>
      {showQuickLink && (
        <Link href={`/requests/${jobId}`} data-inbox-open-request={srn} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 underline-offset-2 hover:text-blue-800 hover:underline">
          Open request
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </span>
  );
}
