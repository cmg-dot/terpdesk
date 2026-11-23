"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedListItem } from "@/components/features/hours-review/AnimatedListItem";
import { WebsiteRequestCard } from "@/components/requests/website/WebsiteRequestCard";
import { WebsiteRequestsEmpty } from "@/components/requests/website/WebsiteRequestsEmpty";
import type { EmptyKind } from "@/components/requests/website/WebsiteRequestsEmpty";
import { WebsiteRequestsStats } from "@/components/requests/website/WebsiteRequestsStats";
import { WebsiteRequestsToolbar } from "@/components/requests/website/WebsiteRequestsToolbar";
import { useClockFrom } from "@/hooks/useClockFrom";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { useWebsiteRequestFilters } from "@/hooks/useWebsiteRequestFilters";
import { applyFilters, boardStats, filterOptions, hasActiveFilters, tabCounts } from "@/lib/websiteRequestView";
import type { WebsiteFilters } from "@/lib/websiteRequestView";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

const PAGE_SIZE = 10;

interface Props {
  rows: WebsiteRequestRow[];
  loadFailed?: boolean;
  /** The filters the page address named (read on the server). */
  initialFilters: WebsiteFilters;
  /** The server's clock when the page was rendered, so the first browser render matches the server's HTML. */
  serverNow: number;
}

/** The Website requests page's body: stats, search and filters, and the queue of cards (Needs review first, soonest appointment at the top). */
export function WebsiteRequestsBoard({ rows, loadFailed = false, initialFilters, serverNow }: Props) {
  const now = useClockFrom(serverNow);
  const { reduce, transition } = useHoursMotion();
  const { filters, update, reset } = useWebsiteRequestFilters(initialFilters);
  const [more, setMore] = useState<{ view: string; pages: number }>({ view: "", pages: 1 });

  const counts = useMemo(() => tabCounts(rows), [rows]);
  const stats = useMemo(() => boardStats(rows, now), [rows, now]);
  const options = useMemo(() => filterOptions(rows), [rows]);
  const matching = useMemo(() => applyFilters(rows, filters, now), [rows, filters, now]);

  if (loadFailed) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        We could not load the website requests. Please refresh the page to try again.
      </div>
    );
  }
  const noop = () => undefined;
  if (rows.length === 0) return <WebsiteRequestsEmpty kind="none_at_all" onShowHandled={noop} onClear={noop} />;

  // "Show more" is forgotten whenever the view changes, so a new search or tab starts at the top again.
  const view = JSON.stringify(filters);
  const pages = more.view === view ? more.pages : 1;
  const visible = matching.slice(0, pages * PAGE_SIZE);
  const left = matching.length - visible.length;
  const emptyKind: EmptyKind = filters.tab === "needs_review" && counts.needs_review === 0 && !hasActiveFilters(filters) ? "queue_clear" : "no_match";

  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transition(0.25)} className="space-y-5" data-website-board="">
      <WebsiteRequestsStats stats={stats} onPick={update} />
      <WebsiteRequestsToolbar filters={filters} counts={counts} settings={options.settings} formats={options.formats} shown={matching.length} onChange={update} onClear={reset} />

      {matching.length === 0 ? (
        <WebsiteRequestsEmpty kind={emptyKind} onShowHandled={() => update({ tab: "handled" })} onClear={reset} />
      ) : (
        <div role="list" aria-label="Website requests" data-website-requests="list" className="-mb-3 flex flex-col">
          <AnimatePresence>
            {visible.map((row, index) => (
              <AnimatedListItem key={row.id} index={index}>
                <WebsiteRequestCard row={row} now={now} />
              </AnimatedListItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      {left > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setMore({ view, pages: pages + 1 })}
            className="min-h-11 rounded-full border border-[var(--forest)] px-6 text-[13px] font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest)] hover:text-[var(--canvas)]"
          >
            Show {Math.min(PAGE_SIZE, left)} more ({left} left)
          </button>
        </div>
      )}
    </motion.div>
  );
}
