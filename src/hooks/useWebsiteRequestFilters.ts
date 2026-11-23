"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FILTERS, filtersToQuery } from "@/lib/websiteRequestView";
import type { WebsiteFilters } from "@/lib/websiteRequestView";

/** How long the filters sit still before the page address is rewritten, so typing in the search box writes the address once, not per key. */
export const ADDRESS_SYNC_MS = 400;

/**
 * Rewrites the address bar only. The browser's own `replaceState` is used on purpose: Next.js wraps `window.history.replaceState` and
 * treats a new query string on this server-rendered page as a navigation, so every filter change would re-run the page on the server
 * (a database read) and could end in a full reload that wipes what the person typed. The board renders from its own state, never from
 * the address, so the router does not need to know.
 */
const writeAddress = (url: string): void => History.prototype.replaceState.call(window.history, window.history.state, "", url);

/**
 * The Website requests board's filters. They start from what the page address says (read on the server, so a shared link or a refresh
 * shows the same view) and write the choices back to the address a moment after they settle, without adding history entries.
 */
export function useWebsiteRequestFilters(initial: WebsiteFilters): { filters: WebsiteFilters; update: (patch: Partial<WebsiteFilters>) => void; reset: () => void } {
  const [filters, setFilters] = useState<WebsiteFilters>(initial);

  useEffect(() => {
    const query = filtersToQuery(filters);
    const timer = setTimeout(() => {
      if (window.location.search.replace(/^\?/, "") !== query) writeAddress(`${window.location.pathname}${query ? `?${query}` : ""}`);
    }, ADDRESS_SYNC_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  const update = useCallback((patch: Partial<WebsiteFilters>) => setFilters((current) => ({ ...current, ...patch })), []);
  const reset = useCallback(() => setFilters((current) => ({ ...DEFAULT_FILTERS, tab: current.tab })), []);
  return { filters, update, reset };
}
