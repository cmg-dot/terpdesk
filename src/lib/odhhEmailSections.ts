import { cleanValue, EMPTY_VALUE } from "@/lib/odhhText";
import { SECTION_NUMBER, endsLabelBlock, labelPattern, parseEmailAddress, parsePhoneNumber, sectionLines, stripSoftLineBreak } from "@/lib/odhhEmailText";

/**
 * The multi-line parts of a state request email: the Appointment Note, section 5 (the client's information, kept whole for the
 * agency-private notes) and the requestor's contact details. Pure. Used by odhhEmailParser.ts.
 */

const NOTE_START_PATTERN =
  /^[ \t]*(?:Appointment[ \t]+Notes?|Special[ \t]+Instructions|Additional[ \t]+(?:Notes?|Information)|Notes?|Comments?)[ \t]*:[ \t]*(.*)$/im;
const MAX_NOTE_LENGTH = 1000;
const MAX_CLIENT_BLOCK_LENGTH = 1500;

// "Requestor" is ODHH's spelling; "Requester" is accepted too.
const REQUESTOR_NAME_PATTERN = labelPattern(["Requestor[ \t]+Name", "Requester[ \t]+Name"]);
const REQUESTOR_PHONE_PATTERN = labelPattern([
  "Requestor[ \t]+(?:Phone|Telephone)(?:[ \t]+(?:Number|No\.?))?",
  "Requester[ \t]+(?:Phone|Telephone)(?:[ \t]+(?:Number|No\.?))?",
]);
const REQUESTOR_EMAIL_PATTERN = labelPattern(["Requestor[ \t]+E-?mail(?:[ \t]+Address)?", "Requester[ \t]+E-?mail(?:[ \t]+Address)?"]);
// Section 5 is "CLIENT/EMPLOYEE INFORMATION" on most forms and "PATIENT INFORMATION" on the health-care (HCA) ones.
// Some forms print a tag after it: "5. CLIENT/EMPLOYEE INFORMATION, Public".
const CLIENT_BLOCK_HEADER = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}((?:CLIENT[ \t]*\/[ \t]*EMPLOYEE|PATIENT)[ \t]+INFORMATION)(?:[ \t]*[,;:–—-][ \t]*[A-Za-z][^\n]{0,40}?)?[ \t]*:?[ \t]*$`, "im");
const REQUESTOR_SECTION_HEADER = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}REQUES?TOR(?:[ \t]+(?:INFORMATION|INFO|DETAILS))?[ \t]*:?[ \t]*$`, "im");

/**
 * Text of a "Label: value" line that may continue onto following lines until a blank line or the next "Label:".
 * Only the lines ABOVE section 5 are read: a "Comment:" inside the client/employee section is private to the agency (it stays in that
 * block) and is never the Appointment Note, even when the requester typed the very same words in both places.
 */
export function extractNote(text: string): string | null {
  const all = text.split("\n");
  const clientAt = all.findIndex((line) => CLIENT_BLOCK_HEADER.test(line));
  const lines = clientAt >= 0 ? all.slice(0, clientAt) : all;
  const start = lines.findIndex((line) => NOTE_START_PATTERN.test(line));
  if (start < 0) return null;
  const parts = [stripSoftLineBreak(lines[start].match(NOTE_START_PATTERN)?.[1] ?? "").trim()];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (endsLabelBlock(line)) break;
    parts.push(stripSoftLineBreak(line).trim());
  }
  const note = parts.join("\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, MAX_NOTE_LENGTH);
  return note && !EMPTY_VALUE.test(note) ? note : null;
}

/** Section 5 (CLIENT/EMPLOYEE or PATIENT INFORMATION), heading plus every line in it, capped so it can't flood the notes. */
export function extractClientInfoBlock(text: string): string | null {
  const lines = sectionLines(text, CLIENT_BLOCK_HEADER);
  if (!lines || lines.length === 0) return null;
  const heading = text.split("\n").map((line) => CLIENT_BLOCK_HEADER.exec(line)?.[1]).find(Boolean) ?? "CLIENT/EMPLOYEE INFORMATION";
  return [heading.replace(/\s+/g, " "), ...lines].join("\n").slice(0, MAX_CLIENT_BLOCK_LENGTH);
}

/** Requestor details: "Requestor Name/Phone/Email" lines, else Name/Phone/Email inside a REQUESTOR section. */
export function extractRequestor(text: string): { name: string | null; phone: string | null; email: string | null } {
  const pick = (v: string | undefined): string | null => {
    const cleaned = cleanValue(v);
    return cleaned && !EMPTY_VALUE.test(cleaned) ? cleaned : null;
  };
  let name = pick(text.match(REQUESTOR_NAME_PATTERN)?.[1]);
  let phone = parsePhoneNumber(pick(text.match(REQUESTOR_PHONE_PATTERN)?.[1]));
  let email = parseEmailAddress(pick(text.match(REQUESTOR_EMAIL_PATTERN)?.[1]));
  if (!name || !phone || !email) {
    const section = sectionLines(text, REQUESTOR_SECTION_HEADER) ?? [];
    const field = (label: RegExp): string | null => {
      const line = section.find((l) => label.test(l));
      return line ? pick(line.replace(label, "")) : null;
    };
    name = name ?? field(/^Name[ \t]*:[ \t]*/i);
    phone = phone ?? parsePhoneNumber(field(/^(?:Phone|Telephone)(?:[ \t]+(?:Number|No\.?))?[ \t]*:[ \t]*/i));
    email = email ?? parseEmailAddress(field(/^E-?mail(?:[ \t]+Address)?[ \t]*:[ \t]*/i));
  }
  return { name, phone, email };
}
