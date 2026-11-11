"use client";

import { fetchDashboardSummary } from "@/app/actions/getDashboardSummary";
import { useCachedAction } from "@/hooks/useCachedAction";
import type { DashboardSummary } from "@/lib/dashboardSummary";

/** How often the figures are re-read while the page is open (and again whenever the tab is shown). */
const REFRESH_MS = 30_000;

export interface DashboardSummaryState {
  /** The latest figures, or null until the first read ever arrives. Coming back from another screen shows the last ones at once. */
  summary: DashboardSummary | null;
  /** True when the first read failed and there is nothing to show yet. A later failed refresh keeps the figures already shown. */
  failed: boolean;
}

/**
 * The dashboard's data: ONE server call for the six figures and the few jobs the page lists, shown from the cache at once on a return
 * visit and refreshed quietly (see useCachedAction): when the screen opens, every 30 seconds, and when the tab regains focus.
 */
export function useDashboardSummary(): DashboardSummaryState {
  const { data, error } = useCachedAction<DashboardSummary>("dashboard-summary", fetchDashboardSummary, { refreshMs: REFRESH_MS });
  return { summary: data ?? null, failed: error && data === undefined };
}
