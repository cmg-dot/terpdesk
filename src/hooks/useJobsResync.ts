"use client";

import { useEffect, useRef } from "react";
import { usePulseChange } from "@/hooks/usePulse";

/** The slow safety net: an open, visible page re-reads the interpreter's jobs this often, whatever the pulse says. */
export const JOBS_SAFETY_POLL_MS = 60_000;
/** Focus and visibility events can come in bursts; one re-read per this long. */
const RESYNC_GAP_MS = 5_000;

/**
 * Keeps the interpreter's jobs current without a refresh. Hours can be submitted outside this tab (the emailed secure link), and the
 * agency can change or cancel a job, so the jobs are read again:
 *  - within about 15 seconds of anything new for this person (hooks/usePulse.ts: an offer arrives or is withdrawn, or a notice about a
 *    job arrives: a cancellation, a schedule change, an answer);
 *  - when the window regains focus or the tab becomes visible;
 *  - once a minute while visible (a slow safety net).
 * `reload` is called only once a login is known (`active`).
 */
export function useJobsResync(active: boolean, reload: () => Promise<void>): void {
  const latest = useRef(reload);
  latest.current = reload;
  const lastSync = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    const resync = (): void => {
      if (document.visibilityState !== "visible" || Date.now() - lastSync.current < RESYNC_GAP_MS) return;
      lastSync.current = Date.now();
      void latest.current();
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    const poll = window.setInterval(resync, JOBS_SAFETY_POLL_MS);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
      window.clearInterval(poll);
    };
  }, [active]);

  usePulseChange(() => {
    if (active) void latest.current();
  });
}
