"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboardSummary } from "@/app/actions/getDashboardSummary";
import type { DashboardSummary } from "@/lib/dashboardSummary";

/** How often the figures are re-read while the page is open (and again whenever the tab is shown). */
const REFRESH_MS = 30_000;

export interface DashboardSummaryState {
  /** The latest figures, or null until the first read arrives. */
  summary: DashboardSummary | null;
  /** True when the first read failed and there is nothing to show yet. A later failed refresh keeps the figures already shown. */
  failed: boolean;
}

/**
 * The dashboard's data: ONE server call for the six figures and the jobs that have not ended, read on arrival, every 30 seconds, and
 * when the tab regains focus (so every figure is from one snapshot). A read already under way is never doubled. A failed refresh keeps
 * what is on screen.
 */
export function useDashboardSummary(): DashboardSummaryState {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchDashboardSummary();
      if (!mounted.current) return;
      setSummary(next);
      setFailed(false);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  return { summary, failed: failed && summary === null };
}
