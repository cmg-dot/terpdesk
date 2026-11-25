import type { CycleView, EntryView } from "@/lib/ceu";

/**
 * What the CEU log can be narrowed and ordered by: a search over the title, provider and category, one cycle (or "no cycle"), an
 * ethics or PPO focus, and the sort. Pure: the browser narrows its own copy, and the CSV export applies the same rules on the server.
 */

export type CeuSort = "newest" | "oldest" | "largest";
export type CeuFocus = "all" | "ethics" | "ppo";

export const ALL_CYCLES = "";
export const NO_CYCLE = "none";

export interface CeuFilters {
  query: string;
  /** "" = every cycle, "none" = entries with no cycle, otherwise a cycle id. */
  cycle: string;
  focus: CeuFocus;
  sort: CeuSort;
}

export const CEU_SORTS: readonly CeuSort[] = ["newest", "oldest", "largest"];
export const CEU_SORT_LABELS: Record<CeuSort, string> = { newest: "Newest first", oldest: "Oldest first", largest: "Largest first" };
export const CEU_FOCUSES: readonly CeuFocus[] = ["all", "ethics", "ppo"];
export const CEU_FOCUS_LABELS: Record<CeuFocus, string> = { all: "All entries", ethics: "Ethics only", ppo: "PPO only" };
export const DEFAULT_CEU_FILTERS: CeuFilters = { query: "", cycle: ALL_CYCLES, focus: "all", sort: "newest" };
export const MAX_CEU_QUERY = 100;

const byDate = (a: EntryView, b: EntryView): number => b.earnedOn.localeCompare(a.earnedOn) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);

const SORTERS: Record<CeuSort, (a: EntryView, b: EntryView) => number> = {
  newest: byDate,
  oldest: (a, b) => -byDate(a, b),
  largest: (a, b) => b.amount - a.amount || byDate(a, b),
};

/** True when every word typed appears in the title, provider or category, ignoring case. */
export function matchesCeuQuery(e: EntryView, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${e.title} ${e.provider} ${e.category}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function applyCeuFilters(entries: readonly EntryView[], filters: CeuFilters): EntryView[] {
  return entries
    .filter((e) => filters.cycle === ALL_CYCLES || (filters.cycle === NO_CYCLE ? e.cycleId === null : e.cycleId === filters.cycle))
    .filter((e) => filters.focus === "all" || (filters.focus === "ethics" ? e.isEthics : e.isPpo))
    .filter((e) => matchesCeuQuery(e, filters.query))
    .sort(SORTERS[filters.sort]);
}

export const hasActiveCeuFilters = (f: CeuFilters): boolean =>
  f.query.trim() !== "" || f.cycle !== ALL_CYCLES || f.focus !== "all" || f.sort !== DEFAULT_CEU_FILTERS.sort;

/** "Fall renewal (2023 to 2026)". Two cycles with the same name and years stay apart because the choice carries the id. */
export const cycleChoiceLabel = (c: CycleView): string => `${c.label} (${c.cycleStart.slice(0, 4)} to ${c.cycleEnd.slice(0, 4)})`;

/** The query string the CSV link carries, so the download is the list as it is shown (not the sort, which the file fixes). */
export function ceuExportQuery(f: CeuFilters): string {
  const search = new URLSearchParams();
  if (f.query.trim()) search.set("q", f.query.trim().slice(0, MAX_CEU_QUERY));
  if (f.cycle !== ALL_CYCLES) search.set("cycle", f.cycle);
  if (f.focus !== "all") search.set("focus", f.focus);
  return search.toString();
}

/** What the export route reads from the address. Anything missing or unknown falls back to "everything". */
export function parseCeuExportQuery(params: URLSearchParams): CeuFilters {
  const cycle = params.get("cycle") ?? "";
  const focus = params.get("focus") ?? "";
  return {
    query: (params.get("q") ?? "").slice(0, MAX_CEU_QUERY),
    cycle: cycle === NO_CYCLE || /^[0-9a-f-]{36}$/i.test(cycle) ? cycle : ALL_CYCLES,
    focus: focus === "ethics" || focus === "ppo" ? focus : "all",
    sort: "newest",
  };
}
