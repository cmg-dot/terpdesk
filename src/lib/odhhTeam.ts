/**
 * How many interpreters a state request asks for. The form has no field for it: the requester writes it in the Appointment Note or
 * the client section's Comment ("2 interpreters needed", "team of two", "interpreter team"). Pure.
 *
 *  - a number of interpreters, stated once (or the same number more than once): that many positions;
 *  - a team named without a number ("interpreter team"): two positions (an ASL team is two), flagged for staff to confirm;
 *  - two different numbers: nothing is set, flagged for staff.
 */

export const TEAM_UNCLEAR_WARNING = "Team requested: check the number of interpreters";
export const TEAM_CONFLICT_WARNING = "The form names more than one number of interpreters: check the team size";

const MAX_TEAM = 4;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, "2": 2, "3": 3, "4": 4 };
const COUNT = String.raw`(two|three|four|[234])`;
const STATED: readonly RegExp[] = [
  // "2 interpreters", "two ASL interpreters", "3 certified interpreters", "2 Deaf interpreters"
  new RegExp(String.raw`\b${COUNT}[ \t]+(?:(?:asl|sign[ \t]+language|certified|deaf|cdi|di|qualified)[ \t]+){0,2}interpreters\b`, "gi"),
  // "team of two", "a team of 2 interpreters"
  new RegExp(String.raw`\bteam[ \t]+of[ \t]+${COUNT}\b`, "gi"),
  // "Number of interpreters: 2", "interpreters needed: 3"
  new RegExp(String.raw`\b(?:number[ \t]+of[ \t]+interpreters|interpreters[ \t]+(?:needed|requested|required))[ \t]*[:\-–][ \t]*${COUNT}\b`, "gi"),
];
const TEAM_WORDS = /\binterpreter[ \t]+team\b|\bteam[ \t]+interpret(?:er|ers|ing)\b|\bteam(?:ed)?[ \t]+(?:of[ \t]+)?interpreters\b/i;

export interface TeamRequest {
  /** The positions to open (2 to MAX_TEAM), or null when the text asks for no team or is unclear about its size. */
  count: number | null;
  /** A fixed label for the job's parse warnings, when a person should confirm the size. */
  warning: string | null;
}

export function teamRequest(...texts: (string | null | undefined)[]): TeamRequest {
  const text = texts.filter(Boolean).join("\n");
  const counts = new Set<number>();
  for (const pattern of STATED) Array.from(text.matchAll(pattern), (m) => counts.add(Math.min(NUMBER_WORDS[m[1].toLowerCase()] ?? 0, MAX_TEAM)));
  counts.delete(0);
  if (counts.size === 1) return { count: Array.from(counts)[0], warning: null };
  if (counts.size > 1) return { count: null, warning: TEAM_CONFLICT_WARNING };
  return TEAM_WORDS.test(text) ? { count: 2, warning: TEAM_UNCLEAR_WARNING } : { count: null, warning: null };
}
