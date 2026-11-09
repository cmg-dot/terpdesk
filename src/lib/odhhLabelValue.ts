import { cleanValue } from "@/lib/odhhText";

/**
 * A "Label: value" line whose value may sit on the NEXT line (pure). A forwarded or HTML email often breaks the line after the
 * label ("Virtual Meeting/Platform:" then the link on the line below, or "Address:" holding only a meeting link with the city
 * below it). The value is read from the label's own line when it has one; otherwise from the next line, but only when the
 * caller approves that line, so a blank label followed by the next label or section heading still reads as blank.
 */

const LABEL_LINE = /^[ \t]*[A-Za-z][A-Za-z0-9 \/#()'&.-]{1,40}:(?:[ \t]|$)/;
const SECTION_LINE = /^[ \t]*(?:\d{1,2}[.)][ \t]*)?[A-Z][A-Z0-9 \/&,'()-]{5,}:?[ \t]*$/;
const RULE_LINE = /^[ \t]*[-=_*]{3,}/;
const MIME_LINE = /^[ \t]*(?:--[^\s-]|Content-[A-Za-z-]+[ \t]*:|=)/i;

/** True when the line is part of the form's own structure (another label, a section heading, a rule, a MIME artifact). */
export const isStructureLine = (line: string): boolean => LABEL_LINE.test(line) || SECTION_LINE.test(line) || RULE_LINE.test(line) || MIME_LINE.test(line);

export interface LabelValue {
  /** The value on the label's line, or the approved next line; null when there is none. */
  value: string | null;
  /** The line right after the value's line when it is plain text (not a label or heading): a continuation such as a city. */
  continuation: string | null;
  /** The plain line right after the continuation (an address can run over three lines), or null. */
  secondContinuation: string | null;
}

const nonBlankAfter = (lines: string[], index: number): { line: string; at: number } | null => {
  for (let i = index + 1; i < lines.length && i <= index + 3; i += 1) {
    if (lines[i].trim() !== "") return { line: lines[i].trim(), at: i };
  }
  return null;
};

/**
 * `labels` are regex fragments (as for labelPattern). The first matching line with a real value wins; a matching line with no
 * value falls back to its next line when `acceptNext` approves it.
 */
export function labelValue(text: string, labels: readonly string[], acceptNext: (line: string) => boolean): LabelValue {
  const lines = text.split("\n");
  const pattern = new RegExp(String.raw`^[ \t]*(?:${labels.join("|")})[ \t]*:[ \t]*(.*?)[ \t]*$`, "i");
  for (let i = 0; i < lines.length; i += 1) {
    const found = pattern.exec(lines[i]);
    if (!found) continue;
    // A line with text after its label is that label's value, as it was before (callers treat "N/A" and the like as empty).
    let value = cleanValue(found[1]);
    let at = i;
    if (!value) {
      const next = nonBlankAfter(lines, i);
      if (next && !isStructureLine(next.line) && acceptNext(next.line)) {
        value = cleanValue(next.line);
        at = next.at;
      }
    }
    if (!value) continue;
    const after = nonBlankAfter(lines, at);
    const continuation = after && after.at === at + 1 && !isStructureLine(after.line) ? cleanValue(after.line) : null;
    const afterContinuation = continuation !== null && after ? nonBlankAfter(lines, after.at) : null;
    const secondContinuation = afterContinuation && afterContinuation.at === (after?.at ?? -1) + 1 && !isStructureLine(afterContinuation.line) ? cleanValue(afterContinuation.line) : null;
    return { value, continuation, secondContinuation };
  }
  return { value: null, continuation: null, secondContinuation: null };
}
