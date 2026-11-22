"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getNewAlerts } from "@/app/actions/pulse";
import { AlertToastStack } from "@/components/ui/AlertToastStack";
import { usePulse, usePulseChange } from "@/hooks/usePulse";
import { TOAST_MS, capToasts, nextToasts } from "@/lib/pulse";
import type { AlertToast } from "@/lib/pulse";

/**
 * Pops up each high-signal alert that arrives while this tab is open (an interpreter: a schedule change or an answer; staff: an offer
 * accepted, declined or expired, or a question), a few seconds after it is created: the 15-second pulse notices something new, and
 * this asks which notices arrived since the last one. Alerts that were already there when the page opened do not pop up (the banners
 * show those). Mounted once per workspace layout. Clicking a toast opens its job or section; each closes itself after a few seconds.
 */
export function AlertToasts() {
  const router = useRouter();
  const { pulse } = usePulse();
  const [toasts, setToasts] = useState<AlertToast[]>([]);
  // Where "new" starts, from the server's own clock and rows (never the browser's), and what has already popped up (a row can be
  // returned twice when two arrive within a millisecond of the cursor).
  const cursor = useRef<string | null | undefined>(undefined);
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    if (pulse && cursor.current === undefined) cursor.current = pulse.latestAt ?? pulse.serverNow;
  }, [pulse]);

  const close = useCallback((id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  usePulseChange(() => {
    if (cursor.current === undefined) return;
    void getNewAlerts({ after: cursor.current ?? null })
      .then((incoming) => {
        const { fresh, cursor: moved } = nextToasts(incoming, seen.current, cursor.current ?? null);
        cursor.current = moved;
        if (fresh.length === 0) return;
        fresh.forEach((t) => {
          seen.current.add(t.id);
          timers.current.set(t.id, window.setTimeout(() => close(t.id), TOAST_MS));
        });
        setToasts((list) => capToasts([...list, ...fresh]));
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const open = (toast: AlertToast) => {
    close(toast.id);
    if (toast.href) router.push(toast.href);
  };

  return <AlertToastStack toasts={toasts} onOpen={open} onClose={close} />;
}
