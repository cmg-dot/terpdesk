"use client";

import { useCallback, useState } from "react";
import { filtersFromSearch, NO_TIMELINE_FILTERS, searchWithFilters } from "@/lib/timelineFilters";
import type { TimelineFilters } from "@/lib/timelineFilters";

/**
 * The Interpreter View's filter choices, kept in the page address (?credential=…&area=…) so they survive a reload, a link
 * that is shared, and switching to another tab of the calendar and back. They live outside the day's data, so paging to
 * another day never clears them. The address is rewritten in place (no extra history entries, no page reload).
 */
export const useTimelineFilters = (): readonly [TimelineFilters, (next: TimelineFilters) => void] => {
  // The timeline only mounts after the calendar page is on screen in the browser, so reading the address here is safe.
  const [filters, setFilters] = useState<TimelineFilters>(() =>
    typeof window === "undefined" ? NO_TIMELINE_FILTERS : filtersFromSearch(window.location.search),
  );

  const update = useCallback((next: TimelineFilters) => {
    setFilters(next);
    try {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${searchWithFilters(search, next)}${hash}`);
    } catch {
      // A browser that refuses to rewrite the address (some embedded views): the filters still work for this visit.
    }
  }, []);

  return [filters, update] as const;
};
