import Link from "next/link";

/**
 * The state request number an email is about. When a job has that number it is a blue link straight to the request; when
 * none does yet it is plain text saying so, so nobody clicks a link that goes nowhere.
 */
export function InboxJobLink({ srn, jobId, className = "" }: { srn: string | null; jobId: string | null; className?: string }) {
  if (!srn) return null;
  if (!jobId) return <span className={`text-slate-500 ${className}`}>SRN #{srn} · no job yet</span>;
  return (
    <Link
      href={`/requests/${jobId}`}
      data-inbox-job-link={srn}
      className={`font-medium text-blue-600 underline underline-offset-2 transition-colors hover:text-blue-800 ${className}`}
    >
      SRN #{srn}
    </Link>
  );
}
