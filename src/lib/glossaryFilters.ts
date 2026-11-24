import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { ALL_SETTINGS } from "@/lib/websiteRequestView";
import { pairLabel } from "@/lib/glossary";
import type { GlossaryTermView } from "@/lib/glossary";

/**
 * What the glossary can be narrowed and ordered by: a search over the term, rendering, note and setting, one language pair, one
 * setting, and the sort. Pure (the browser narrows its own copy, and the CSV export applies the same rules on the server).
 */

export type GlossarySort = "newest" | "az" | "setting";

export interface GlossaryFilters {
  query: string;
  pair: string;
  setting: string;
  sort: GlossarySort;
}

export const ALL_PAIRS = "All language pairs";
export const GLOSSARY_SORTS: readonly GlossarySort[] = ["newest", "az", "setting"];
export const GLOSSARY_SORT_LABELS: Record<GlossarySort, string> = { newest: "Newest first", az: "A to Z", setting: "By setting" };
export const DEFAULT_GLOSSARY_FILTERS: GlossaryFilters = { query: "", pair: ALL_PAIRS, setting: ALL_SETTINGS, sort: "newest" };
export const MAX_GLOSSARY_QUERY = 100;

const sameText = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
const created = (t: GlossaryTermView): number => new Date(t.createdAt).getTime() || 0;
const byTerm = (a: GlossaryTermView, b: GlossaryTermView): number => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);

/** True when every word typed appears in the term, rendering, note or setting, ignoring case. */
export function matchesGlossaryQuery(t: GlossaryTermView, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${t.term} ${t.rendering} ${t.note} ${t.setting}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const SORTERS: Record<GlossarySort, (a: GlossaryTermView, b: GlossaryTermView) => number> = {
  newest: (a, b) => created(b) - created(a) || byTerm(a, b),
  az: byTerm,
  // A term with no setting sorts after every term that has one.
  setting: (a, b) => (a.setting === "" ? 1 : 0) - (b.setting === "" ? 1 : 0) || a.setting.localeCompare(b.setting) || byTerm(a, b),
};

export function applyGlossaryFilters(terms: readonly GlossaryTermView[], filters: GlossaryFilters): GlossaryTermView[] {
  return terms
    .filter((t) => filters.pair === ALL_PAIRS || sameText(pairLabel(t), filters.pair))
    .filter((t) => filters.setting === ALL_SETTINGS || sameText(t.setting, filters.setting))
    .filter((t) => matchesGlossaryQuery(t, filters.query))
    .sort(SORTERS[filters.sort]);
}

/** "All language pairs", then each pair the glossary has, most used first. */
export function glossaryPairOptions(terms: readonly GlossaryTermView[]): string[] {
  const counts = new Map<string, number>();
  for (const t of terms) counts.set(pairLabel(t), (counts.get(pairLabel(t)) ?? 0) + 1);
  return [ALL_PAIRS, ...Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label)];
}

/** "All settings", then the system's settings, then any other setting a term carries. */
export function glossarySettingOptions(terms: readonly GlossaryTermView[]): string[] {
  const extras = Array.from(new Set(terms.map((t) => t.setting).filter(Boolean))).filter((value) => !FILTER_SETTINGS.some((choice) => sameText(choice, value)));
  return [ALL_SETTINGS, ...FILTER_SETTINGS, ...extras.sort((a, b) => a.localeCompare(b))];
}

export const hasActiveGlossaryFilters = (filters: GlossaryFilters): boolean =>
  filters.query.trim() !== "" || filters.pair !== ALL_PAIRS || filters.setting !== ALL_SETTINGS || filters.sort !== DEFAULT_GLOSSARY_FILTERS.sort;

/** The query string the CSV link carries, so the download is the list as it is shown (search, pair, setting). */
export function glossaryExportQuery(filters: GlossaryFilters): string {
  const search = new URLSearchParams();
  if (filters.query.trim()) search.set("q", filters.query.trim().slice(0, MAX_GLOSSARY_QUERY));
  if (filters.pair !== ALL_PAIRS) search.set("pair", filters.pair);
  if (filters.setting !== ALL_SETTINGS) search.set("setting", filters.setting);
  return search.toString();
}

/** What the export route reads from the address. Anything missing or unknown falls back to "everything". */
export function parseGlossaryExportQuery(params: URLSearchParams): GlossaryFilters {
  return {
    query: (params.get("q") ?? "").slice(0, MAX_GLOSSARY_QUERY),
    pair: (params.get("pair") ?? "").slice(0, 90) || ALL_PAIRS,
    setting: (params.get("setting") ?? "").slice(0, 80) || ALL_SETTINGS,
    sort: "newest",
  };
}
