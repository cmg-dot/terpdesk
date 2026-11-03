/**
 * The Interpreter View's "smart filters": narrow the rows by a credential and by a location tag. Pure functions, safe in
 * client components.
 *
 * Credentials come from the agency-private certification text ("CDI; NIC Advanced"), split into one tag per credential.
 * Location tags are the interpreter's service areas ("Seattle", "Virtual Only"). Both compare ignoring capitals and extra
 * spaces. The two filters combine (a person must match every filter that is set); an empty value means "any".
 */

export interface TimelineFilters {
  /** One credential tag, or "" for any. */
  credential: string;
  /** One location (service-area) tag, or "" for any. */
  area: string;
}

export const NO_TIMELINE_FILTERS: TimelineFilters = { credential: "", area: "" };

/** What a person's filter tags look like. */
export interface FilterFacts {
  credentials: readonly string[];
  areas: readonly string[];
}

const MAX_TAG_LENGTH = 100;
const squash = (value: string): string => value.replace(/\s+/g, " ").trim();
const keyOf = (value: string): string => squash(value).toLowerCase();

/** "CDI; NIC Advanced, QMHI" -> ["CDI", "NIC Advanced", "QMHI"]: split on ; , | and line breaks, blanks and repeats dropped. */
export const splitCredentials = (text: string | null | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (text ?? "").split(/[;,|\n]+/)) {
    const tag = squash(part).slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
};

/** True when `tags` holds `wanted` as a whole tag (ignoring capitals and extra spaces). */
export const hasFilterTag = (tags: readonly string[], wanted: string): boolean => {
  const key = keyOf(wanted);
  return tags.some((tag) => keyOf(tag) === key);
};

export const matchesTimelineFilters = (person: FilterFacts, filters: TimelineFilters): boolean =>
  (keyOf(filters.credential) === "" || hasFilterTag(person.credentials, filters.credential)) &&
  (keyOf(filters.area) === "" || hasFilterTag(person.areas, filters.area));

/** How many filters are narrowing the rows. */
export const countTimelineFilters = (filters: TimelineFilters): number =>
  [keyOf(filters.credential) !== "", keyOf(filters.area) !== ""].filter(Boolean).length;

export interface FilterOption {
  value: string;
  /** How many of the given people carry this tag. */
  count: number;
}

/**
 * The choices for one dropdown: every distinct tag among `people` (first-seen spelling, A to Z) with how many people
 * carry it. A selection nobody carries any more (an old bookmark, a tag since removed) is kept as a 0-count choice so it
 * stays visible and can be cleared. `current` is the choice to show as selected, spelled exactly as in `options`.
 */
export const buildFilterOptions = (
  people: readonly FilterFacts[],
  field: "credentials" | "areas",
  selected: string,
): { options: FilterOption[]; current: string } => {
  const byKey = new Map<string, FilterOption>();
  for (const person of people) {
    const mine = new Set<string>();
    for (const tag of person[field]) {
      const key = keyOf(tag);
      if (key === "" || mine.has(key)) continue;
      mine.add(key);
      const known = byKey.get(key);
      if (known) known.count += 1;
      else byKey.set(key, { value: squash(tag), count: 1 });
    }
  }
  const wanted = squash(selected);
  if (wanted !== "" && !byKey.has(keyOf(wanted))) byKey.set(keyOf(wanted), { value: wanted, count: 0 });
  const options = Array.from(byKey.values()).sort((a, b) => a.value.localeCompare(b.value));
  return { options, current: wanted === "" ? "" : (byKey.get(keyOf(wanted))?.value ?? wanted) };
};

const CREDENTIAL_PARAM = "credential";
const AREA_PARAM = "area";

/** The filters written in a URL's query string (anything else in it is ignored; over-long values are cut). */
export const filtersFromSearch = (search: string): TimelineFilters => {
  const params = new URLSearchParams(search);
  const read = (name: string): string => squash(params.get(name) ?? "").slice(0, MAX_TAG_LENGTH);
  return { credential: read(CREDENTIAL_PARAM), area: read(AREA_PARAM) };
};

/** `search` (a query string, with or without the leading "?") with the filters written into it, other parameters kept. */
export const searchWithFilters = (search: string, filters: TimelineFilters): string => {
  const params = new URLSearchParams(search);
  for (const [name, value] of [[CREDENTIAL_PARAM, filters.credential], [AREA_PARAM, filters.area]] as const) {
    const clean = squash(value).slice(0, MAX_TAG_LENGTH);
    if (clean === "") params.delete(name);
    else params.set(name, clean);
  }
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
};
