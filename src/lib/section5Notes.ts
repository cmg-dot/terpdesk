import { SECTION_5_HEADING } from "@/lib/stateFormTypes";

/**
 * Section 5 ("PATIENT INFORMATION" / "CLIENT/EMPLOYEE INFORMATION") as the state-form intake saved it: a block of
 * "Label: value" lines inside the agency-private notes. The request forms keep the person's details in their own fields
 * (see requestFormExtras.ts), so the notes box shows only what staff wrote, and this file takes the block apart and puts it
 * back together without losing any line the forms have no field for ("Interpreter Gender", "Comment", ...).
 * Pure.
 */

export interface Section5Block {
  /** The block's own heading line, as saved. */
  title: string;
  /** The lines under the heading, up to the first blank line. */
  lines: string[];
}

export interface SplitNotes {
  /** Everything except the block: what staff wrote and the state's flags line. */
  general: string;
  block: Section5Block | null;
}

/** The rows the request forms have a field for, as they are labelled in the block. */
export const KNOWN_ROW_LABELS = ["Provider One #", "Gender", "Hearing Identity", "Specific Interpreter Requested"] as const;
export type KnownRowLabel = (typeof KNOWN_ROW_LABELS)[number];

const LABEL_LINE = /^([^:]{1,60}):[ \t]*(.*)$/;
const norm = (label: string): string => label.toLowerCase().replace(/[^a-z0-9#]/g, "");
const KNOWN_BY_NORM = new Map<string, KnownRowLabel>(KNOWN_ROW_LABELS.map((label) => [norm(label), label]));

/** The known row a block line belongs to, with its value; null for any other line. */
export function knownRow(line: string): { label: KnownRowLabel; value: string } | null {
  const match = LABEL_LINE.exec(line.trim());
  const label = match ? KNOWN_BY_NORM.get(norm(match[1])) : undefined;
  return match && label ? { label, value: match[2].trim() } : null;
}

interface Group {
  /** The row's label (normalised), or null for lines before the first label. */
  label: string | null;
  lines: string[];
}

const BLANK_VALUE = /^(?:n\/?a|none)?$/i;

/** A block's lines grouped by row: a "Label: value" line plus the unlabelled lines that wrap under it. */
function groupsOf(lines: string[]): Group[] {
  const groups: Group[] = [];
  for (const line of lines) {
    const match = LABEL_LINE.exec(line.trim());
    if (match) groups.push({ label: norm(match[1]), lines: [line] });
    else if (groups.length > 0) groups[groups.length - 1].lines.push(line);
    else groups.push({ label: null, lines: [line] });
  }
  return groups;
}

const groupValue = (group: Group): string => (LABEL_LINE.exec(group.lines[0].trim())?.[2] ?? "").trim();

/**
 * The saved notes taken apart. Section 5 can be in the notes more than once (the intake saved it, then a later copy of the same
 * form added it again), so every block is taken out and they are merged by row label: the first block's order is kept and a blank
 * row is filled from a later block that has a value. Nothing with a value is dropped.
 */
export function splitSection5(privateNotes: string): SplitNotes {
  const lines = privateNotes.split("\n");
  const rest: string[] = [];
  const blocks: Section5Block[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!SECTION_5_HEADING.test(lines[i].trim())) {
      rest.push(lines[i]);
      continue;
    }
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== "") end += 1;
    blocks.push({ title: lines[i].trim(), lines: lines.slice(i + 1, end) });
    i = end - 1;
  }
  const general = rest.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (blocks.length === 0) return { general, block: null };
  const merged: Group[] = [];
  for (const block of blocks) {
    for (const group of groupsOf(block.lines)) {
      const at = group.label === null ? -1 : merged.findIndex((m) => m.label === group.label);
      if (at < 0) merged.push(group);
      else if (BLANK_VALUE.test(groupValue(merged[at])) && !BLANK_VALUE.test(groupValue(group))) merged[at] = group;
    }
  }
  return { general, block: { title: blocks[0].title, lines: merged.flatMap((g) => g.lines) } };
}

/** The block's lines that no form field covers, as one text (what the "other details" box shows). */
export const otherBlockText = (block: Section5Block | null): string =>
  (block?.lines ?? []).filter((line) => knownRow(line) === null).join("\n");

/** The notes box text and the block put back together (the block goes last, after a blank line). */
export function joinSection5(general: string, block: Section5Block | null): string {
  const text = block ? [block.title, ...block.lines].join("\n") : "";
  return [general.trim(), text].filter(Boolean).join("\n\n");
}

/**
 * The block with the staff's edits applied. A known row is rewritten only when its value really changed (so the state's own
 * wording is never replaced by a label), and dropped when cleared. The other lines are kept as they are unless staff edited the
 * "other details" box, in which case that text replaces them.
 */
export function updateBlock(
  block: Section5Block,
  values: Partial<Record<KnownRowLabel, string>>,
  sameValue: (label: KnownRowLabel, saved: string, entered: string) => boolean,
  otherText: string,
): Section5Block {
  const otherEdited = otherText.trim() !== otherBlockText(block).trim();
  const merged: string[] = [];
  let otherPlaced = false;
  for (const line of block.lines) {
    const row = knownRow(line);
    if (row) {
      const entered = (values[row.label] ?? row.value).trim();
      // A row that was blank and still is stays as saved; a row staff cleared is dropped; an unchanged value keeps the state's wording.
      const kept = entered === "" ? (row.value === "" ? line : null) : sameValue(row.label, row.value, entered) ? line : `${row.label}: ${entered}`;
      if (kept !== null) merged.push(kept);
    } else {
      if (!otherEdited) merged.push(line);
      else if (!otherPlaced) {
        otherPlaced = true;
        merged.push(...otherText.split("\n").filter((l) => l.trim() !== ""));
      }
    }
  }
  if (otherEdited && !otherPlaced && otherText.trim() !== "") merged.push(...otherText.split("\n").filter((l) => l.trim() !== ""));
  return { title: block.title, lines: merged };
}
