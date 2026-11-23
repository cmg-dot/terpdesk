import Link from "next/link";

interface MileageEmptyProps {
  /** True when no mileage exists at all (not just none in the chosen period). */
  noneAtAll: boolean;
  /** The chosen period, for the message when there is some mileage, just not in it. */
  allTime: boolean;
}

/** The Mileage list with nothing to show: what appears here, how it gets here, and what is not tracked here. */
export function MileageEmpty({ noneAtAll, allTime }: MileageEmptyProps) {
  if (!noneAtAll) {
    return (
      <div data-mileage-empty="period" className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-[var(--sage)]">
        No mileage reported {allTime ? "yet" : "in this period"}. Try a longer period, or All time.
      </div>
    );
  }
  return (
    <div data-mileage-empty="none" className="space-y-3 rounded-2xl border border-dashed border-gray-200 bg-white p-6 sm:p-8">
      <h2 className="text-[16px] font-semibold text-[var(--ink)]">No mileage yet</h2>
      <p className="text-sm leading-relaxed text-[var(--sage)]">
        When you submit hours for an agency job and add the miles you drove, they appear here with the agency&apos;s approval status. Reporting miles
        is part of the hours form on each job.
      </p>
      <p className="text-sm leading-relaxed text-[var(--sage)]">
        A log for miles on jobs you do outside an agency is not available yet. Nothing on this page counts them.
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm font-medium text-[var(--forest)]">
        <Link href="/jobs" className="hover:underline">See your jobs</Link>
        <Link href="/agencies" className="hover:underline">Connect with an agency</Link>
      </div>
    </div>
  );
}
