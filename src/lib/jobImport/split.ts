/**
 * Untangles the interpreter column of the Jobs sheet. One cell can hold several people ("Kelly B & Karen",
 * "John Doe / Jane Smith"). Pure functions, no I/O.
 */

/** " & " and " / " (spaces optional: "A&B", "A/B") and the word " and " (spaces required, so "Anderson" never splits). */
const SEPARATOR = /\s*&\s*|\s*\/\s*|\s+and\s+/i;

/** Cells people type when nobody is assigned yet. */
const NOBODY = /^(?:-+|\?+|n\/?a|none|nil|tbd|tba|open|unfilled|unassigned|needed|needs interpreter|no interpreter)$/i;

const collapse = (value: string): string => value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The people named in one cell, in the order written, trimmed. Empty and "nobody yet" cells give an empty list; the
 * same name twice (ignoring capitals) is kept once.
 */
export const splitInterpreterNames = (cell: string | null | undefined): string[] => {
  const text = collapse(cell ?? "");
  if (text === "" || NOBODY.test(text)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of text.split(SEPARATOR)) {
    const name = collapse(part);
    if (name === "" || NOBODY.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
};
