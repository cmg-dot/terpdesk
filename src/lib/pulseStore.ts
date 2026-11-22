import { getPulse } from "@/app/actions/pulse";
import { invalidateKey } from "@/lib/clientCache";
import { PULSE_INTERVAL_MS, pulseSignature } from "@/lib/pulse";
import type { Pulse } from "@/lib/pulse";

/**
 * One shared poller for the whole tab. While anything is subscribed, it reads the pulse (actions/pulse.ts) every 15 seconds if the tab
 * is visible, and straight away when the tab becomes visible or regains focus. `changes` goes up each time the pulse differs from the
 * last one; screens re-read their own data when it does (hooks/usePulse.ts). Nothing is read while the tab is hidden or when nobody is
 * listening, an overlapping read is skipped, and a failed read keeps the last answer. Client only.
 */

export interface PulseSnapshot {
  pulse: Pulse | null;
  /** How many times the pulse has changed since this tab started reading it. */
  changes: number;
}

/** Everything the store needs from the browser, so the tests can drive it with a fake clock. */
export interface PulseEnv {
  fetchPulse: () => Promise<Pulse | null>;
  isVisible: () => boolean;
  /** Calls `fn` every `ms`; returns the function that stops it. */
  every: (fn: () => void, ms: number) => () => void;
  /** Calls `fn` when the tab becomes visible or the window regains focus; returns the function that stops listening. */
  onWake: (fn: () => void) => () => void;
  now: () => number;
  /** Runs once per change, before the screens are told (for example: drop cached answers that are now out of date). */
  onChange?: (pulse: Pulse) => void;
}

/** Coming back to the tab reads at once, but not more often than this. */
export const WAKE_THROTTLE_MS = 2_000;

export interface PulseStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PulseSnapshot;
  /** Reads now (a screen that just changed something can ask for the answer sooner than the timer). */
  refreshNow: () => Promise<void>;
}

export function createPulseStore(env: PulseEnv, intervalMs: number = PULSE_INTERVAL_MS): PulseStore {
  let snapshot: PulseSnapshot = { pulse: null, changes: 0 };
  const listeners = new Set<() => void>();
  let inFlight = false;
  let lastWakeRead = Number.NEGATIVE_INFINITY;
  let stopTimer: (() => void) | null = null;
  let stopWake: (() => void) | null = null;

  const read = async (): Promise<void> => {
    if (inFlight || !env.isVisible()) return;
    inFlight = true;
    try {
      const next = await env.fetchPulse().catch(() => null);
      if (!next) return;
      const prev = snapshot.pulse;
      const changed = prev !== null && pulseSignature(prev) !== pulseSignature(next);
      // The first answer is kept (so later ones can be compared); an unchanged one changes nothing, so no screen re-renders every 15 s.
      if (prev !== null && !changed) return;
      snapshot = { pulse: next, changes: snapshot.changes + (changed ? 1 : 0) };
      if (changed) env.onChange?.(next);
      listeners.forEach((listener) => listener());
    } finally {
      inFlight = false;
    }
  };

  const start = (): void => {
    void read();
    stopTimer = env.every(() => void read(), intervalMs);
    stopWake = env.onWake(() => {
      if (!env.isVisible() || env.now() - lastWakeRead < WAKE_THROTTLE_MS) return;
      lastWakeRead = env.now();
      void read();
    });
  };

  const stop = (): void => {
    stopTimer?.();
    stopWake?.();
    stopTimer = null;
    stopWake = null;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => snapshot,
    refreshNow: read,
  };
}

let shared: PulseStore | null = null;

/** The tab's one store, created on first use in the browser. */
export function sharedPulseStore(): PulseStore {
  if (!shared) {
    shared = createPulseStore({
      fetchPulse: getPulse,
      isVisible: () => document.visibilityState === "visible",
      every: (fn, ms) => {
        const timer = window.setInterval(fn, ms);
        return () => window.clearInterval(timer);
      },
      onWake: (fn) => {
        window.addEventListener("focus", fn);
        document.addEventListener("visibilitychange", fn);
        return () => {
          window.removeEventListener("focus", fn);
          document.removeEventListener("visibilitychange", fn);
        };
      },
      now: () => Date.now(),
      // Staff's dashboard figures (offers out, bookings) are cached in memory: anything that moves them makes them stale.
      onChange: () => invalidateKey("dashboard-summary"),
    });
  }
  return shared;
}
