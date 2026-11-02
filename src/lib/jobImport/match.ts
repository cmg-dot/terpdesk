/**
 * Matches a name from the Jobs sheet to a person on the agency's roster. Pure functions, no I/O.
 *
 * Interpreter names live on the interpreter record (account name) and the profile (preferred name), not in the
 * interpreter_profiles table itself, so a candidate carries both spellings.
 *
 * Two tiers, never a guess between people:
 *  1. exact: the same name ignoring capitals, punctuation and extra spaces;
 *  2. partial (optional): the sheet's name is the START of exactly one person's name, where a single letter stands for
 *     a name beginning with it ("Karen" = Karen Ames, "Kelly B" = Kelly Brown). More than one possible person is
 *     "ambiguous" and is left unmatched.
 */

export interface RosterCandidate {
  id: string;
  /** How the person is shown (preferred name, else account name). */
  label: string;
  /** Every spelling that should match: account name and preferred name. */
  names: string[];
}

export type NameMatch =
  | { kind: "exact" | "partial"; interpreterId: string; label: string }
  | { kind: "ambiguous"; candidates: number }
  | { kind: "none" };

/** Lowercase, no punctuation, single spaces: "Kelly B." and "kelly  b" are the same key. */
export const matchKey = (name: string): string =>
  name.normalize("NFKC").toLowerCase().replace(/[.,;:'"()]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (name: string): string[] => matchKey(name).split(" ").filter(Boolean);

/** Is `wanted` the beginning of `full`, token by token (a one-letter token is an initial)? */
const startsLike = (wanted: string[], full: string[]): boolean =>
  wanted.length > 0 && wanted.length <= full.length && wanted.every((token, i) => full[i] === token || (token.length === 1 && full[i].startsWith(token)));

const only = (found: Map<string, RosterCandidate>, kind: "exact" | "partial"): NameMatch => {
  if (found.size === 0) return { kind: "none" };
  if (found.size > 1) return { kind: "ambiguous", candidates: found.size };
  const person = Array.from(found.values())[0];
  return { kind, interpreterId: person.id, label: person.label };
};

export const matchInterpreterName = (name: string, roster: readonly RosterCandidate[], allowPartial: boolean): NameMatch => {
  const key = matchKey(name);
  if (key === "") return { kind: "none" };

  const exact = new Map<string, RosterCandidate>();
  for (const person of roster) if (person.names.some((n) => matchKey(n) === key)) exact.set(person.id, person);
  if (exact.size > 0) return only(exact, "exact");
  if (!allowPartial) return { kind: "none" };

  const wanted = tokens(name);
  const partial = new Map<string, RosterCandidate>();
  for (const person of roster) if (person.names.some((n) => startsLike(wanted, tokens(n)))) partial.set(person.id, person);
  return only(partial, "partial");
};
