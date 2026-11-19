import { MAX_FIELD_LENGTH } from "@/lib/odhhText";

/**
 * The low-level text helpers every state-email parser shares: flattening an email to plain lines, the line patterns (labels,
 * section headings, rules, MIME artifacts), and the value readers (SRN, date, time, e-mail address, phone). Pure functions, no I/O.
 * Kept apart from odhhEmailParser.ts (which re-exports all of it) so each file stays small.
 */

const SRN_ALLOWED = /^[A-Za-z0-9-]{0,40}$/;

export const TIME_FRAGMENT = String.raw`\d{1,2}(?::\d{2})?\s*[AaPp]\.?\s*[Mm]\.?`;

// The number itself: digits (with "-" groups), optionally led by a short letter prefix ("SRN-12345"). It stops where the digits do,
// so "202786989Requestor Name" (a flattened email runs the next label straight after the number) reads as 202786989, and a
// word such as "pending" is not taken for a number.
const SRN_TOKEN = String.raw`((?:[A-Za-z]{1,5}-?)?\d+(?:-\d+)*)`;
export const SRN_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`Service\s+Request\s*(?:#|No\.?|Number)\s*:?\s*#?\s*${SRN_TOKEN}`, "i"),
  new RegExp(String.raw`\bSRN\s*[:#]?\s*#?\s*${SRN_TOKEN}`, "i"),
];

/** Builds a line-anchored "Label: value" matcher. Labels are trusted regex fragments. */
export function labelPattern(labels: readonly string[]): RegExp {
  return new RegExp(String.raw`^[ \t]*(?:${labels.join("|")})[ \t]*:[ \t]*(.+?)[ \t]*$`, "im");
}

// A new "Label:" line ends a multi-line note. "https://" and times like "8:00" are not labels.
const NEXT_LABEL_PATTERN = /^[ \t]*[A-Za-z][A-Za-z0-9 \/#()'-]{1,40}:(?:[ \t]|$)/;
// Section headings may be numbered ("5. CLIENT/EMPLOYEE INFORMATION", "5) ...").
export const SECTION_NUMBER = String.raw`(?:\d{1,2}[.)][ \t]*)?`;
// A section heading is a line of capitals only ("5. APPOINTMENT INFORMATION"). A rule line ends a section too, with or
// without text inside it ("----------", "===== CONTRACTOR AND INTERPRETER ONLY =====").
const SECTION_HEADER_PATTERN = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}[A-Z][A-Z0-9 \/&,'()-]{5,}:?[ \t]*$`);
const RULE_LINE_PATTERN = /^[ \t]*[-=_*]{3,}/;

// Artifacts of a forwarded (MIME) email. The email's own text ends at the first such line, so a section or note is
// cut off there and none of it is saved.
//  - a MIME boundary: "--000000000abc", "--_000_x", "--=_Part_1" (not a "-- " signature or a "-----" rule)
//  - a MIME header: "Content-Type: ...", "Content-Transfer-Encoding: ...", any "Content-...:"
//  - the quoted-printable "=" at the start of a line ("=", "=3D=3D...")
//  - the standard signature delimiter ("-- " alone on a line): everything after it is the sender's signature
const MIME_BOUNDARY_PATTERN = /^[ \t]*--[^\s-]/;
const MIME_HEADER_PATTERN = /^[ \t]*Content-[A-Za-z-]+[ \t]*:/i;
const QUOTED_PRINTABLE_LINE_PATTERN = /^[ \t]*=/;
const SIGNATURE_DELIMITER_PATTERN = /^[ \t]*--[ \t]*$/;
const isMimeArtifactLine = (line: string): boolean =>
  MIME_BOUNDARY_PATTERN.test(line) || MIME_HEADER_PATTERN.test(line) || QUOTED_PRINTABLE_LINE_PATTERN.test(line) || SIGNATURE_DELIMITER_PATTERN.test(line);

/** A quoted-printable soft line break leaves a trailing "=" on the line; it is removed from kept text. */
export const stripSoftLineBreak = (line: string): string => line.replace(/[ \t]*=[ \t]*$/, "");
/** A numbered section heading only ("5. PATIENT INFORMATION"), not any line in capitals. */
const NUMBERED_SECTION_HEADER_PATTERN = /^[ \t]*\d{1,2}[.)][ \t]*[A-Z][A-Z0-9 \/&,'()-]{5,}/;

/**
 * A line that ends a multi-line "Label: value": blank, the next "Label:", a section heading, a rule or a MIME artifact. With
 * `numberedHeadersOnly`, a line in capitals ("PARK IN THE VISITOR LOT") is part of the value and only a numbered heading ends it.
 */
export const endsLabelBlock = (line: string, opts: { numberedHeadersOnly?: boolean } = {}): boolean =>
  line.trim() === "" ||
  NEXT_LABEL_PATTERN.test(line) ||
  RULE_LINE_PATTERN.test(line) ||
  (opts.numberedHeadersOnly ? NUMBERED_SECTION_HEADER_PATTERN : SECTION_HEADER_PATTERN).test(line) ||
  isMimeArtifactLine(line);

// ---- a form whose line breaks were lost ("...Appointment Date: 11/12/2026Appointment Start Time: 9:00 AMAppointment End Time: ...")
// Some forwards arrive as one long line: the table cells run together. The state form's own section headings and labels are put
// back on lines of their own, so the line-anchored readers work again. Only a text whose numbered headings sit INSIDE a line is
// touched (a normal form, with its headings at the start of a line, is left exactly as it was).
const FORM_HEADING = String.raw`\d\.[ \t]*(?:INTERPRETER[ \t]+AGENCY|ACCOUNT[ \t]+INFORMATION|APPOINTMENT[ \t]+INFORMATION|APPOINTMENT[ \t]+LOCATION|CLIENT[ \t]*\/[ \t]*EMPLOYEE[ \t]+INFORMATION|PATIENT[ \t]+INFORMATION|STAFF[ \t]+INFORMATION)`;
const INLINE_HEADING = new RegExp(String.raw`[^\s][ \t]*${FORM_HEADING}`);
// A heading on a line of its own, with the tag some forms print after it ("3. APPOINTMENT INFORMATION - Crucial Appointment").
const HEADING_LINE = new RegExp(String.raw`[ \t]*(${FORM_HEADING}(?:[ \t]*[,;–—-][ \t]*(?:Crucial[ \t]+Appointment|Public|Private)\b)?)[ \t]*`, "g");
const RULE_BREAK = /[ \t]*(={5,}|-{8,})/g;
/** The first word of the form's labels. A glued "...wa.govRequestor Email:" or "9:00 AMAppointment End Time:" splits before it. */
const LABEL_WORDS = [
  "Appointment", "Requestor", "Requester", "Billing", "Account", "Agency", "Contact", "Phone", "Email", "E-mail", "Text", "Fax", "Address",
  "Location", "Building", "Floor", "Room", "Direction", "Directions", "Virtual", "Platform", "Gender", "Hearing", "Specific", "Interpreter",
  "Comment", "Comments", "Provider", "Booking", "Purpose", "HCA", "Service", "Setting", "Preferred", "Department", "Division", "Program",
  "Organization", "Office", "Cost", "Start", "End", "Name", "Title", "Patient", "Client", "Employee", "Staff", "Supervisor", "Funding",
].join("|");
// Not after "/": "Virtual Meeting/Platform:" is one label, never "Virtual Meeting/" then "Platform:".
const GLUED_LABEL = new RegExp(String.raw`(?<=[^ \n/])(?=(?:${LABEL_WORDS})(?![a-z])(?:[ \t]+[A-Za-z\/&#()'.-]+){0,5}[ \t]*:)`, "g");
// Right after an EMPTY label ("Specific Interpreter Requested: Interpreter Gender: ..."): only the form's exact labels, so a value
// that merely starts with a label word ("Location: Office of ...") is never cut.
const AFTER_EMPTY_LABEL = new RegExp(
  String.raw`(?<=:[ \t]+)(?=(?:Interpreter[ \t]+Gender|Comments?|Hearing[ \t]+Identity|Gender|Text|E-?mail|Phone|Contact|Room|Floor|Building|Directions?[ \t]*&[ \t]*Parking[ \t]+Note|Specific[ \t]+Interpreter[ \t]+Requested|Provider[ \t]*One[ \t]*#?|Booking[ \t]+Period|Appointment[ \t]+(?:Notes?|Setting|Date|Start[ \t]+Time|End[ \t]+Time)|Virtual[ \t]+Meeting[ \t]*\/[ \t]*Platform|Address|Location)[ \t]*:)`,
  "g",
);
// "Public - No" / "Mixed Group - Yes" (a dash, not a colon), glued on or right after an empty label ("Platform: Public - No").
const GLUED_DASH_LABEL = /(?<=[^ \n]|:[ \t]+)(?=(?:Public|Mixed[ \t]+Group)[ \t]*[-–—]|THIS[ \t]+REQUEST[ \t]+REQUIRES\b)/g;

/** A flattened state form put back on separate lines; any other text unchanged. */
export function unflattenStateForm(text: string): string {
  if (!INLINE_HEADING.test(text)) return text;
  return text.replace(HEADING_LINE, "\n$1\n").replace(RULE_BREAK, "\n$1").replace(AFTER_EMPTY_LABEL, "\n").replace(GLUED_LABEL, "\n").replace(GLUED_DASH_LABEL, "\n");
}

/** Lambda may forward HTML bodies — flatten to plain text lines before matching. */
export function normalizeEmailText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  // Real non-breaking spaces (Outlook, Comcast) and zero-width characters would defeat the "[ \t]" in every label pattern.
  text = text.replace(/[   ]/g, " ").replace(/[​-‍﻿]/g, "");
  if (/<[a-z][^>]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  // A forward quotes the original with "> " (nested: "> > "). Every pattern is line-anchored, so the markers go.
  return unflattenStateForm(text.replace(/^[ \t]*(?:>[ \t]*)+/gm, ""));
}

/** Enforces /^[A-Za-z0-9-]{0,40}$/. Anything else is discarded rather than stored. */
export function sanitizeSrn(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim().replace(/^#/, "");
  if (trimmed.length === 0 || !SRN_ALLOWED.test(trimmed)) return null;
  return trimmed;
}

/** "12/15/2021" | "12/15/21" -> "2021-12-15" */
export function toIsoDate(usDate: string): string | null {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const month = Number(mm);
  const day = Number(dd);
  const year = yy.length === 2 ? `20${yy}` : yy;
  // A real calendar day only: 2/31 must not roll over into March.
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(Number(year), month, 0)).getUTCDate()) return null;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "8:00 AM" | "8 am" | "12:30 p.m." -> "08:00" | "08:00" | "12:30" */
export function to24HourTime(time12: string): string | null {
  const m = time12.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/);
  if (!m) return null;
  const [, hh, mi = "00", meridiem] = m;
  let hours = Number(hh);
  if (hours < 1 || hours > 12 || Number(mi) > 59) return null;
  const isPm = meridiem.toUpperCase() === "P";
  if (hours === 12) hours = isPm ? 12 : 0;
  else if (isPm) hours += 12;
  return `${String(hours).padStart(2, "0")}:${mi}`;
}

/** Non-empty lines of the section that starts at `header`, up to the next section heading or rule line. */
export function sectionLines(text: string, header: RegExp): string[] | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => header.test(line));
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (SECTION_HEADER_PATTERN.test(line) || RULE_LINE_PATTERN.test(line) || isMimeArtifactLine(line)) break;
    const cleaned = stripSoftLineBreak(line.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")).replace(/[ \t]+/g, " ").trim();
    if (cleaned) out.push(cleaned.slice(0, MAX_FIELD_LENGTH));
  }
  return out;
}

/** First e-mail address in the value (a trailing "mailto:", brackets or punctuation are ignored). */
export function parseEmailAddress(value: string | null): string | null {
  if (!value) return null;
  const found = value.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
  return found ? found[0].toLowerCase().slice(0, 120) : null;
}

/** The first phone number in the value, as written (with any extension), when it has at least 7 digits. */
export function parsePhoneNumber(value: string | null): string | null {
  if (!value) return null;
  const found = value.match(/\+?\(?\d[\d\s().-]{5,}\d(?:[ \t]*(?:x|ext\.?|#)[ \t]*\d{1,6})?/i)?.[0];
  const cleaned = found?.replace(/\s+/g, " ").trim().slice(0, 40) ?? null;
  return cleaned && cleaned.replace(/\D/g, "").length >= 7 ? cleaned : null;
}
