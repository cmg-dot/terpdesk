"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { acknowledgeAcceptedOffers, getAcceptedOfferAlerts } from "@/app/actions/acceptedOfferAlerts";
import type { AcceptedOfferAlert } from "@/lib/acceptedOfferAlert";

/** How often an open, visible agency page checks for new acceptances. */
const POLL_MS = 30_000;
/** Toasts on screen at once; the rest wait their turn. */
const MAX_VISIBLE = 3;

/**
 * Acceptances staff have not seen yet, as a queue of toasts. Checked on every page change, when the window regains focus and every
 * 30 s while the tab is visible. A toast is marked seen for the agency (acknowledgeAcceptedOffers) as soon as it is on screen, so it
 * never pops up again after it is closed, followed to Staffing or runs out its time; each staff member keeps their own bell entry.
 */
export function useAcceptedOfferToasts() {
  const pathname = usePathname();
  const [visible, setVisible] = useState<AcceptedOfferAlert[]>([]);
  const shown = useRef<AcceptedOfferAlert[]>([]);
  const queue = useRef<AcceptedOfferAlert[]>([]);
  // Every offer already queued or shown in this tab: a poll that runs before its acknowledgement lands must not repeat it.
  const known = useRef(new Set<string>());

  const fill = useCallback(() => {
    const room = MAX_VISIBLE - shown.current.length;
    if (room <= 0 || queue.current.length === 0) return;
    const next = queue.current.slice(0, room);
    queue.current = queue.current.slice(room);
    shown.current = [...shown.current, ...next];
    setVisible(shown.current);
    // Seen from the moment it is on screen. Server Actions run one at a time, so a mark sent only when the toast leaves could still
    // be waiting in line when the tab is reloaded or closed, and the toast would pop up again.
    void acknowledgeAcceptedOffers(next.map((a) => a.offerId)).catch(() => undefined);
  }, []);

  const check = useCallback(async () => {
    const alerts = await getAcceptedOfferAlerts().catch((): AcceptedOfferAlert[] => []);
    const fresh = alerts.filter((a) => !known.current.has(a.offerId));
    if (fresh.length === 0) return;
    fresh.forEach((a) => known.current.add(a.offerId));
    // Oldest first, so they appear in the order they happened.
    queue.current = [...queue.current, ...fresh.reverse()];
    fill();
  }, [fill]);

  useEffect(() => {
    void check();
  }, [pathname, check]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = window.setInterval(onFocus, POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check]);

  /** Closed, followed or timed out: off the screen, and the next one in line takes its place. */
  const finish = useCallback((offerId: string) => {
    shown.current = shown.current.filter((a) => a.offerId !== offerId);
    setVisible(shown.current);
    fill();
  }, [fill]);

  return { toasts: visible, finish };
}
