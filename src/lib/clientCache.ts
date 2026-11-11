/**
 * A small in-memory cache for what the agency screens read from the server, so moving between the dashboard, the Requests list and the
 * calendar shows the last answer at once and refreshes it quietly (the stale-while-revalidate pattern). It lives in the browser tab's
 * memory only: nothing is written to storage, a reload starts empty, and `clearClientCache` empties it when someone signs out. Keys are
 * scoped to the signed-in user by the caller (see useCachedAction), so one login can never be shown another's answer.
 * Client only.
 */

export interface CacheEntry<T> {
  data: T | undefined;
  /** The last read failed; `data` is still the last good answer, if there is one. */
  error: boolean;
  /** When `data` was last read from the server (ms). */
  updatedAt: number;
  validating: boolean;
}

/** An answer older than this is not shown (a tab left open for hours must not show yesterday's board as if it were live). */
export const MAX_CACHE_AGE_MS = 10 * 60_000;
/** Two reads for one key closer together than this are one read (a quick back-and-forth between screens). */
export const DEDUPE_MS = 2_000;

const entries = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();
/** Bumped by clearClientCache: a read that was under way when it happened must not put its answer back. */
let generation = 0;

const notify = (key: string): void => listeners.get(key)?.forEach((listener) => listener());

/** The cached entry, or undefined. Returns the same object until the entry changes (what useSyncExternalStore needs). */
export const readEntry = <T,>(key: string): CacheEntry<T> | undefined => entries.get(key) as CacheEntry<T> | undefined;

export function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Drops an answer that is too old to show. Call before reading on mount. */
export function evictIfExpired(key: string, nowMs: number = Date.now()): void {
  const entry = entries.get(key);
  if (entry && nowMs - entry.updatedAt > MAX_CACHE_AGE_MS) {
    entries.delete(key);
    notify(key);
  }
}

/**
 * Reads `fetcher` and puts the answer in the cache. A read already under way is shared; one that finished a moment ago is not repeated.
 * A failed read keeps the last good answer and marks the entry as errored. Never throws.
 */
export function revalidate<T>(key: string, fetcher: () => Promise<T>, nowMs: number = Date.now()): Promise<void> {
  const running = inFlight.get(key);
  if (running) return running;
  const current = readEntry<T>(key);
  if (current && !current.error && nowMs - current.updatedAt < DEDUPE_MS) return Promise.resolve();

  const startedIn = generation;
  entries.set(key, { data: current?.data, error: current?.error ?? false, updatedAt: current?.updatedAt ?? 0, validating: true });
  notify(key);
  const run = fetcher()
    .then((data) => {
      if (startedIn !== generation) return;
      entries.set(key, { data, error: false, updatedAt: Date.now(), validating: false });
    })
    .catch(() => {
      if (startedIn !== generation) return;
      const last = readEntry<T>(key);
      entries.set(key, { data: last?.data, error: true, updatedAt: last?.updatedAt ?? 0, validating: false });
    })
    .finally(() => {
      inFlight.delete(key);
      if (startedIn === generation) notify(key);
    });
  inFlight.set(key, run);
  return run;
}

/** Empties the cache (sign-out, sign-in as someone else) and tells every screen that is showing an answer from it. */
export function clearClientCache(): void {
  generation += 1;
  const keys = Array.from(entries.keys());
  entries.clear();
  inFlight.clear();
  keys.forEach(notify);
}
