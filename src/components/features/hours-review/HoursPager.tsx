import Link from "next/link";
import { buildPageTokens } from "@/components/ui/AnimatedPaginatedList";

const pagerBase = "inline-flex items-center justify-center min-w-[2.5rem] px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg transition-colors";

interface Props {
  page: number;
  totalPages: number;
  /** The link to a page, with the search and filters kept (see hrefForPage). */
  hrefFor: (page: number) => string;
  /** "top" sits above the list (no rule, and says which page you are on); "bottom" closes it. */
  position?: "top" | "bottom";
}

/** Same numbered-block look as "Needs attention" and "Upcoming bookings". */
export function HoursPager({ page, totalPages, hrefFor, position = "bottom" }: Props) {
  const top = position === "top";
  return (
    <nav
      aria-label={top ? "Pagination, above the list" : "Pagination"}
      className={`flex flex-wrap items-center gap-2 ${top ? "" : "mt-6 py-4 border-t border-gray-200"}`}
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${pagerBase} bg-white text-slate-700 hover:bg-slate-50`}>
          Prev
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pagerBase} bg-white text-gray-300 cursor-not-allowed pointer-events-none`}>
          Prev
        </span>
      )}

      {buildPageTokens(page, totalPages).map((token) =>
        typeof token === 'number' ? (
          <Link
            key={token}
            href={hrefFor(token)}
            aria-current={token === page ? 'page' : undefined}
            className={`${pagerBase} ${
              token === page
                ? 'bg-[#163C3A] text-white border-transparent'
                : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {token}
          </Link>
        ) : (
          <span key={token} className="px-1 text-gray-400" aria-hidden="true">
            …
          </span>
        ),
      )}

      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={`${pagerBase} bg-white text-slate-700 hover:bg-slate-50`}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pagerBase} bg-white text-gray-300 cursor-not-allowed pointer-events-none`}>
          Next
        </span>
      )}

      {top && <span className="ml-auto text-[13px] text-gray-600">Page {page} of {totalPages}</span>}
    </nav>
  );
}
