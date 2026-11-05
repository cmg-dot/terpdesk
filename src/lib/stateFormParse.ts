import { normalizeEmailText } from "@/lib/odhhEmailParser";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { PRE_AUTHORIZATION_BANNER, SECTION_TITLES } from "@/lib/stateFormTypes";
import type { FormRow, FormSection, StateFormView } from "@/lib/stateFormTypes";

/**
 * Reads the state's request email into its five numbered sections, row by row, keeping the state's own labels. Pure.
 * The email's lines are the source: nothing is looked up or guessed, and a blank line on the form stays blank.
 */

const NUM = String.raw`(?:\d{1,2}[.)][ \t]*)?`;
const HEADERS: { number: 1 | 2 | 3 | 4 | 5; pattern: RegExp }[] = [
  { number: 1, pattern: new RegExp(String.raw`^[ \t]*${NUM}INTERPRETER[ \t]+AGENCY[ \t]*:?[ \t]*$`, "i") },
  { number: 2, pattern: new RegExp(String.raw`^[ \t]*${NUM}ACCOUNT[ \t]+INFORMATION[ \t]*:?[ \t]*$`, "i") },
  { number: 3, pattern: new RegExp(String.raw`^[ \t]*${NUM}APPOINTMENT[ \t]+INFORMATION(?:[ \t]*[-–—:][ \t]*(.+?))?[ \t]*$`, "i") },
  { number: 4, pattern: new RegExp(String.raw`^[ \t]*${NUM}APPOINTMENT[ \t]+LOCATION[ \t]*:?[ \t]*$`, "i") },
  // Some forms print a tag after the heading: "5. CLIENT/EMPLOYEE INFORMATION, Public".
  { number: 5, pattern: new RegExp(String.raw`^[ \t]*${NUM}((?:CLIENT[ \t]*\/[ \t]*EMPLOYEE|PATIENT)[ \t]+INFORMATION)(?:[ \t]*[,;:–—-][ \t]*([A-Za-z][^\n]{0,40}?))?[ \t]*:?[ \t]*$`, "i") },
];

/** The rule line that closes the form ("====== CONTRACTOR ======") and the MIME artifacts of a forward. */
const ENDS_FORM = /^[ \t]*(?:[-=_*]{3,}|--[^\s-]|Content-[A-Za-z-]+[ \t]*:)/;

const LABELLED = /^([A-Za-z][^:]{0,58}?)[ \t]*:[ \t]*(.*)$/;
const HASH_LABEL = /^([A-Za-z][A-Za-z ]{1,30}?)[ \t]*#[ \t]*(\S.*)?$/;
const DASH_LABEL = /^(.+?)[ \t]+-[ \t]+(Yes|No)$/i;
const DATE_REQUEST = /^(Date of Interpreter Request)[ \t]*-[ \t]*(.+)$/i;

const tidy = (value: string): string => value.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();

/** One section's lines turned into rows: "Label: value", wrapped values joined, "Public - No" read as a row. */
export function rowsFromLines(lines: string[]): FormRow[] {
  const rows: FormRow[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const labelled = LABELLED.exec(line);
    if (labelled && !/^https?$/i.test(labelled[1])) {
      rows.push({ label: tidy(labelled[1]), value: tidy(labelled[2]) || null });
      return;
    }
    const request = DATE_REQUEST.exec(line);
    if (request) return void rows.push({ label: request[1], value: tidy(request[2]) });
    // The lines after "Appointment Note:" / "Comment:" are that note, whatever they contain.
    const previous = rows[rows.length - 1];
    if (previous && /note|comment/i.test(previous.label)) {
      previous.value = `${previous.value ?? ""}\n${line}`.trim();
      return;
    }
    const hash = HASH_LABEL.exec(line);
    if (hash) return void rows.push({ label: `${tidy(hash[1])} #`, value: hash[2] ? tidy(hash[2]) : null });
    const dash = DASH_LABEL.exec(line);
    if (dash) return void rows.push({ label: tidy(dash[1]), value: dash[2] });
    // A sub-heading the form repeats as the next line's label ("Appointment Type" then "Appointment Type: ...").
    if ((lines[i + 1] ?? "").trim().toLowerCase().startsWith(`${line.toLowerCase()}:`)) return;
    const last = rows[rows.length - 1];
    // A value that wraps: an address over several lines, or a list ("a & b &", "x@y.org;") that goes on below.
    if (last && (/address/i.test(last.label) || /[&;,]$/.test(last.value ?? ""))) {
      last.value = tidy(`${last.value ?? ""} ${line}`);
      return;
    }
    rows.push({ label: "", value: tidy(line) });
  });
  return rows;
}

const sectionLinesOf = (lines: string[], start: number): string[] => {
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (ENDS_FORM.test(lines[i]) || HEADERS.some((h) => h.pattern.test(lines[i]))) break;
    out.push(lines[i]);
  }
  return out;
};

/** The five sections of the state's email, or null when it has none of them (not a state form). */
export function parseStateFormEmail(rawContent: string): StateFormView | null {
  const text = normalizeEmailText(rawContent);
  const lines = text.split("\n");
  const sections: FormSection[] = [];
  for (const { number, pattern } of HEADERS) {
    const at = lines.findIndex((line) => pattern.test(line));
    if (at < 0) continue;
    const match = pattern.exec(lines[at]);
    const heading = number === 5 ? (match?.[1] ?? "") : number === 3 ? "APPOINTMENT INFORMATION" : SECTION_TITLES[number];
    sections.push({
      number,
      title: heading.replace(/\s+/g, " ").toUpperCase(),
      tag: number === 3 && match?.[1] ? tidy(match[1]) : number === 5 && match?.[2] ? tidy(match[2]) : null,
      rows: rowsFromLines(sectionLinesOf(lines, at)),
      private: number === 5,
    });
  }
  if (sections.length === 0) return null;
  const extras = parseFormExtras(text);
  const firstSection = Math.min(...HEADERS.map((h) => lines.findIndex((l) => h.pattern.test(l))).filter((n) => n >= 0));
  const sent = /^[ \t]*Date:[ \t]*(\S.*)$/im.exec(lines.slice(0, firstSection).join("\n"))?.[1];
  return {
    source: "email",
    sections,
    banners: extras.preAuthorizationRequired ? [PRE_AUTHORIZATION_BANNER] : [],
    sentAt: sent ? tidy(sent) : null,
  };
}
