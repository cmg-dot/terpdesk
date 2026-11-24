import type { JobPage } from "@/lib/personalJobFilters";

interface Props {
  window: JobPage;
  total: number;
  onPage: (page: number) => void;
}

const BUTTON = "inline-flex min-h-11 min-w-[6.5rem] items-center justify-center rounded-full border px-5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10";
const ENABLED = "border-[var(--forest)] text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]";

/** "Showing 1-10 of 24", Previous, "Page 1 of 3" and Next. Only drawn when the list runs past one page. */
export function MyWorkPager({ window: slot, total, onPage }: Props) {
  if (slot.pages <= 1) return null;
  return (
    <nav aria-label="Pagination" data-my-work-pager="" className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-between">
      <p className="text-[13px] text-[var(--sage)]" data-my-work-range="">
        Showing {slot.from}-{slot.to} of {total}
      </p>
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
        <button type="button" onClick={() => onPage(slot.page - 1)} disabled={slot.page <= 1} className={`${BUTTON} ${ENABLED} disabled:hover:bg-transparent disabled:hover:text-[var(--forest)]`}>
          Previous
        </button>
        <span className="text-[13px] font-medium text-[var(--ink)]" aria-current="page" data-my-work-page="">
          Page {slot.page} of {slot.pages}
        </span>
        <button type="button" onClick={() => onPage(slot.page + 1)} disabled={slot.page >= slot.pages} className={`${BUTTON} ${ENABLED} disabled:hover:bg-transparent disabled:hover:text-[var(--forest)]`}>
          Next
        </button>
      </div>
    </nav>
  );
}
