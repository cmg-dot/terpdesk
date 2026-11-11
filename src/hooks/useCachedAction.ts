"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { evictIfExpired, MAX_CACHE_AGE_MS, readEntry, revalidate, subscribe } from "@/lib/clientCache";

/** Coming back to the tab re-reads, but not more often than this. */
const FOCUS_THROTTLE_MS = 5_000;

export interface CachedActionOptions {
  /** Re-read this often while the tab is visible. Omit for no timer. */
  refreshMs?: number;
}

export interface CachedActionResult<T> {
  /** The last answer (from the cache straight away on a return visit), or undefined until the first read arrives. */
  data: T | undefined;
  /** The last read failed. `data` is still the last good answer, if any. */
  error: boolean;
  /** A read is under way. */
  isValidating: boolean;
}

const noop = (): void => undefined;

/**
 * Stale-while-revalidate for a read-only Server Action. The last answer is shown at once (zero wait on a return visit to a screen),
 * and a fresh one is read quietly: every time the screen opens, when the tab regains focus, and on a timer if `refreshMs` is set. The
 * screen never blanks while it refreshes, and a failed refresh keeps what is shown. Screens that read the same key share one answer and
 * one read. The cache is per signed-in user and lives in memory only (see lib/clientCache.ts). Nothing is read until a user is known.
 */
export function useCachedAction<T>(key: string, fetcher: () => Promise<T>, options: CachedActionOptions = {}): CachedActionResult<T> {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const cacheKey = userId ? `${userId}:${key}` : null;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const { refreshMs } = options;

  const subscribeToKey = useCallback((listener: () => void) => (cacheKey ? subscribe(cacheKey, listener) : noop), [cacheKey]);
  const stored = useSyncExternalStore(
    subscribeToKey,
    () => (cacheKey ? readEntry<T>(cacheKey) : undefined),
    () => undefined,
  );

  // An answer too old to trust is not shown (it is also dropped from memory when the screen opens, below).
  const entry = stored && (stored.data === undefined || Date.now() - stored.updatedAt <= MAX_CACHE_AGE_MS) ? stored : undefined;

  useEffect(() => {
    if (!cacheKey) return undefined;
    const read = (): void => void revalidate(cacheKey, () => fetcherRef.current());
    evictIfExpired(cacheKey);
    read();
    const timer = refreshMs ? setInterval(() => document.visibilityState === "visible" && read(), refreshMs) : null;
    let lastFocusRead = Date.now();
    const onShown = (): void => {
      if (document.visibilityState !== "visible" || Date.now() - lastFocusRead < FOCUS_THROTTLE_MS) return;
      lastFocusRead = Date.now();
      read();
    };
    window.addEventListener("focus", onShown);
    document.addEventListener("visibilitychange", onShown);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onShown);
      document.removeEventListener("visibilitychange", onShown);
    };
  }, [cacheKey, refreshMs]);

  return { data: entry?.data, error: entry?.error ?? false, isValidating: entry?.validating ?? false };
}
