"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { sharedPulseStore } from "@/lib/pulseStore";
import type { PulseSnapshot } from "@/lib/pulseStore";

const EMPTY: PulseSnapshot = { pulse: null, changes: 0 };

/**
 * The latest pulse (lib/pulse.ts). Using it keeps the tab's one 15-second poll running; the poll stops when no component uses it.
 */
export function usePulse(): PulseSnapshot {
  const store = sharedPulseStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}

/**
 * Runs `callback` each time the pulse changes after this component mounted (a new notification, an offer accepted or declined, a
 * question answered). Not on mount: the component loads its own data then. Use it to re-read what the screen shows.
 */
export function usePulseChange(callback: () => void): void {
  const { changes } = usePulse();
  const latest = useRef(callback);
  latest.current = callback;
  const seen = useRef(changes);
  useEffect(() => {
    if (seen.current === changes) return;
    seen.current = changes;
    latest.current();
  }, [changes]);
}
