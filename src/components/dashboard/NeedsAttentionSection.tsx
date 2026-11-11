import Link from "next/link";
import { AnimatedPaginatedList } from "@/components/ui/AnimatedPaginatedList";
import { formatEventTime } from "@/components/dashboard/dashboardFormat";
import type { NeedsAttentionJob } from "@/lib/dashboardLists";
import { NEEDS_ATTENTION_HORIZON_DAYS } from "@/lib/needsAttention";

/** The dot colour and button wording for a job's staffing label. */
const cardStyle = (job: NeedsAttentionJob): { dotColor: string; btnLabel: string } => {
  const status = job.displayStatus;
  const lower = status.toLowerCase();
  let dotColor = "bg-[#B59A6D]";
  let btnLabel = "Manage slots";
  if (status === "Needs replacement" || status === "Staff follow-up") {
    dotColor = "bg-red-500";
    btnLabel = "Open";
  } else if (lower.includes("awaiting") || lower.includes("offer") || lower.includes("pending")) {
    dotColor = "bg-[#AF4A3F]";
    btnLabel = "View";
  } else if (lower.includes("partially")) {
    dotColor = "bg-[var(--tint-ink)]";
    btnLabel = "Manage slots";
  } else if (lower.includes("unfilled") || lower.includes("draft")) {
    btnLabel = "Open";
  }
  if (job.hasAcceptedOffer) btnLabel = "Manage slots";
  return { dotColor, btnLabel };
};

interface Props {
  jobs: readonly NeedsAttentionJob[];
  /** How many jobs need attention in all: `jobs` is only the most urgent of them. */
  total: number;
  /** How many of `jobs` start later than the attention horizon. */
  laterCount: number;
}

/** "Needs attention": jobs that need someone, the imminent ones first (see lib/needsAttention.ts). */
export const NeedsAttentionSection = ({ jobs, total, laterCount }: Props) => (
  <section className="space-y-5">
    <h2 className="text-lg font-semibold text-[var(--ink)] px-2">Needs attention</h2>

    <div className="space-y-2.5">
      {jobs.length === 0 && <p className="text-sm text-[var(--sage)]">Nothing needs your attention right now.</p>}
      <AnimatedPaginatedList
        items={[...jobs]}
        itemsPerPage={5}
        className="space-y-2.5"
        getKey={(job) => job.id}
        renderItem={(job) => {
          const { dotColor, btnLabel } = cardStyle(job);
          return (
            <Link href={`/requests/${job.id}`} key={job.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#EFECE5] px-6 py-3.5 hover:bg-[#e8e4db] transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${dotColor}`}></div>
                <div className="flex flex-col">
                  <p className="text-[15px] font-medium text-slate-800">{job.displayStatus} — {job.title}</p>
                  <p className="mt-0.5 text-[13px] text-[var(--sage)]">{formatEventTime(job.startsAt, job.endsAt, job.timeZone)}</p>
                </div>
              </div>
              <div className="ml-4 shrink-0 text-sm font-medium text-slate-700 transition-colors">{btnLabel}</div>
            </Link>
          );
        }}
      />
      {total > jobs.length && (
        <p className="px-2 pt-1 text-xs text-[var(--sage)]">
          Showing the {jobs.length} most urgent of {total}.{" "}
          <Link href="/requests?filter=needing-coverage" className="font-medium text-slate-600 hover:text-[var(--ink)] transition-colors">See the rest in Requests →</Link>
        </p>
      )}
      {total <= jobs.length && laterCount > 0 && jobs.length > laterCount && (
        <p className="px-2 pt-1 text-xs text-[var(--sage)]">{laterCount} more starting later than {NEEDS_ATTENTION_HORIZON_DAYS} days are listed after the nearer ones.</p>
      )}
      {total <= jobs.length && laterCount > 0 && jobs.length === laterCount && (
        <p className="px-2 pt-1 text-xs text-[var(--sage)]">Nothing starts in the next {NEEDS_ATTENTION_HORIZON_DAYS} days; these all start later.</p>
      )}
    </div>
  </section>
);
