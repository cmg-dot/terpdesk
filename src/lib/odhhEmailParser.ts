import { fromZonedTime } from "date-fns-tz";
import { type Program } from "@/db/schema";
import { labelValue } from "@/lib/odhhLabelValue";
import { joinAddressLines, platformFrom, resolveLocation, splitLink } from "@/lib/odhhLocationParse";
import { MAX_FIELD_LENGTH, cleanValue, EMPTY_VALUE } from "@/lib/odhhText";

// Kept importable from here: other parsers read these helpers from this module.
export { cleanValue, EMPTY_VALUE };

/**
 * Parser for forwarded ODHH dispatch emails (pure functions, no I/O). Used by the /api/intake webhook.
 * Matching is line-anchored "Label: value", case-insensitive, and tolerant of extra whitespace, 
 and HTML bodies.
 */

// Must match the schema's Program union (frontend checks program === 'WA ODHH').
export const ODHH_PROGRAM: Program = "WA ODHH";
// ODHH is a Washington State agency — appointment times are Pacific.
export const ODHH_TIME_ZONE_IANA = "America/Los_Angeles";
export const ODHH_TIME_ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";
const SRN_ALLOWED = /^[A-Za-z0-9-]{0,40}$/;

export type AppointmentFormat = "in_person" | "virtual" | "hybrid";

// Labels must match the frontend's modality options exactly.
export const FORMAT_LABELS: Record<AppointmentFormat, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid — in person and virtual",
};

export interface ParsedIntakeEmail {
  srn: string | null;
  date: string | null; // as written, e.g. 12/15/2021
  isoDate: string | null; // 2021-12-15
  startTime: string | null; // as written, e.g. 8:00 AM
  endTime: string | null;
  start24: string | null; // 08:00
  end24: string | null;
  /** The place's name. Null when the Location line is a room code ("E1", see `locationCode`) or only says "Virtual". */
  venue: string | null;
  /** A short room / unit code from the Location line. A detail of the place (its room), never its name. */
  locationCode: string | null;
  /** The physical address. A meeting link on the Address line is moved to `meetingLink`, leaving just the city. */
  address: string | null;
  format: AppointmentFormat | null;
  formatInferred: boolean;
  clientName: string | null;
  purpose: string | null;
  /** Virtual meeting platform (e.g. "Zoom"), when the email names one or gives a meeting link. */
  platform: string | null;
  /** http(s) meeting link only; any other value is discarded. */
  meetingLink: string | null;
  /** Free-text appointment note (may span several lines). */
  appointmentNote: string | null;
  clientGender: string | null;
  /** The person at ODHH who requested the service. Becomes the draft's one-time requester. */
  requestorName: string | null;
  requestorPhone: string | null;
  requestorEmail: string | null;
  /**
   * The whole "CLIENT/EMPLOYEE INFORMATION" section (Gender, Hearing Identity, Preferred Notification, ...) as
   * formatted text, heading included, so nothing in it is lost. Null when the email has no such section.
   */
  clientInfoBlock: string | null;
}

export const TIME_FRAGMENT = String.raw`\d{1,2}(?::\d{2})?\s*[AaPp]\.?\s*[Mm]\.?`;

// The number itself: digits (with "-" groups), optionally led by a short letter prefix ("SRN-12345"). It stops where the digits do,
// so "202786989Requestor Name" (a flattened email runs the next label straight after the number) reads as 202786989, and a
// word such as "pending" is not taken for a number.
const SRN_TOKEN = String.raw`((?:[A-Za-z]{1,5}-?)?\d+(?:-\d+)*)`;
export const SRN_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`Service\s+Request\s*(?:#|No\.?|Number)\s*:?\s*#?\s*${SRN_TOKEN}`, "i"),
  new RegExp(String.raw`\bSRN\s*[:#]?\s*#?\s*${SRN_TOKEN}`, "i"),
];
// Only the appointment's own date. A bare "Date:" line is the forwarded message's header ("Date: 11/02/2026 11:45 AM PST",
// the day it was SENT), and "Date of Interpreter Request - ..." is the day it was requested: neither is the appointment.
const DATE_PATTERN = /^[ \t]*(?:Appointment|Service)[ \t]+Date[ \t]*:[ \t]*(\d{1,2}\/\d{1,2}\/\d{2,4})\b/im;
// The same number as it appears in a subject: "Interpreter Request - 12/7/2026 - #202786930".
const SUBJECT_SRN_PATTERN = /#[ \t]*(\d{6,12})\b/;

/**
 * A job email must carry at least one of these labels. A conversational reply ("RE: email update") has none, so it is
 * never turned into a calendar event.
 */
export const JOB_ANCHOR_PATTERNS: readonly RegExp[] = [
  /^[ \t]*Appointment[ \t]*:/im,
  /^[ \t]*Appointment[ \t]+Date[ \t]*:/im,
  /^[ \t]*HCA[ \t]+Reference[ \t]+Number[ \t]*:/im,
  /^[ \t]*BOOKING[ \t]+Appointment[ \t]+Date[ \t]+and[ \t]+Time[ \t]*:/im,
];

export const hasJobAnchor = (text: string): boolean => JOB_ANCHOR_PATTERNS.some((pattern) => pattern.test(text));
const START_TIME_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?Start[ \t]+Time[ \t]*:[ \t]*(${TIME_FRAGMENT})`,
  "im"
);
const END_TIME_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?End[ \t]+Time[ \t]*:[ \t]*(${TIME_FRAGMENT})`,
  "im"
);
// Fallback for a single line such as "Time: 8:00 AM - 9:00 AM".
const TIME_RANGE_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?Time[ \t]*:[ \t]*(${TIME_FRAGMENT})[ \t]*(?:-|–|—|to)[ \t]*(${TIME_FRAGMENT})`,
  "im"
);

/** Builds a line-anchored "Label: value" matcher. Labels are trusted regex fragments. */
export function labelPattern(labels: readonly string[]): RegExp {
  return new RegExp(String.raw`^[ \t]*(?:${labels.join("|")})[ \t]*:[ \t]*(.+?)[ \t]*$`, "im");
}

const VENUE_PATTERN = labelPattern(["Location", "Location[ \\t]+Name", "Venue", "Facility"]);
const ADDRESS_LABELS = ["Address", "Location[ \\t]+Address", "Street[ \\t]+Address"] as const;
const FORMAT_PATTERN = labelPattern([
  "Format",
  "Service[ \\t]+Format",
  "Modality",
  "Service[ \\t]+Type",
  "Appointment[ \\t]+Type",
  "Delivery[ \\t]+Method",
]);
const CLIENT_PATTERN = labelPattern([
  "Patient[ \\t]+Name",
  "Client[ \\t]+Name",
  "Consumer[ \\t]+Name",
  "Deaf[ \\t]+(?:Consumer|Client|Participant)",
  "Patient",
  "Client",
  "Consumer",
]);
const PURPOSE_PATTERN = labelPattern([
  "Purpose[ \\t]+of[ \\t]+(?:Appointment|Visit|Assignment)",
  "Appointment[ \\t]+Purpose",
  "Purpose",
  "Reason[ \\t]+for[ \\t]+(?:Appointment|Visit)",
]);

const MEETING_LABELS = [
  "Virtual[ \t]+Meeting[ \t]*/[ \t]*Platform",
  "Virtual[ \t]+Meeting(?:[ \t]+(?:Platform|Link|URL|Information|Info))?",
  "Virtual[ \t]+(?:Platform|Link)",
  "Meeting[ \t]+(?:Platform|Link|URL)",
  "Video[ \t]+(?:Platform|Link)",
  "Platform",
] as const;
// When the meeting label is empty, the line below counts as its value only if it holds a link or names a video platform
// (a form's blank "Virtual Meeting/Platform:" is followed by other text, which must never become the platform).
const holdsMeeting = (line: string): boolean => /https?:\/\//i.test(line) || platformFrom(line) !== null;
const holdsLink = (line: string): boolean => /https?:\/\//i.test(line);
const GENDER_PATTERN = labelPattern(["Client[ \t]+Gender", "Consumer[ \t]+Gender", "Patient[ \t]+Gender", "Gender"]);
const NOTE_START_PATTERN =
  /^[ \t]*(?:Appointment[ \t]+Notes?|Special[ \t]+Instructions|Additional[ \t]+(?:Notes?|Information)|Notes?|Comments?)[ \t]*:[ \t]*(.*)$/im;
// A new "Label:" line ends a multi-line note. "https://" and times like "8:00" are not labels.
const NEXT_LABEL_PATTERN = /^[ \t]*[A-Za-z][A-Za-z0-9 \/#()'-]{1,40}:(?:[ \t]|$)/;
const MAX_NOTE_LENGTH = 1000;
const MAX_CLIENT_BLOCK_LENGTH = 1500;

// "Requestor" is ODHH's spelling; "Requester" is accepted too.
const REQUESTOR_NAME_PATTERN = labelPattern(["Requestor[ \t]+Name", "Requester[ \t]+Name"]);
const REQUESTOR_PHONE_PATTERN = labelPattern([
  "Requestor[ \t]+(?:Phone|Telephone)(?:[ \t]+(?:Number|No\.?))?",
  "Requester[ \t]+(?:Phone|Telephone)(?:[ \t]+(?:Number|No\.?))?",
]);
const REQUESTOR_EMAIL_PATTERN = labelPattern(["Requestor[ \t]+E-?mail(?:[ \t]+Address)?", "Requester[ \t]+E-?mail(?:[ \t]+Address)?"]);
// Section headings may be numbered ("5. CLIENT/EMPLOYEE INFORMATION", "5) ...").
const SECTION_NUMBER = String.raw`(?:\d{1,2}[.)][ \t]*)?`;
// Section 5 is "CLIENT/EMPLOYEE INFORMATION" on most forms and "PATIENT INFORMATION" on the health-care (HCA) ones.
// Some forms print a tag after it: "5. CLIENT/EMPLOYEE INFORMATION, Public".
const CLIENT_BLOCK_HEADER = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}((?:CLIENT[ \t]*\/[ \t]*EMPLOYEE|PATIENT)[ \t]+INFORMATION)(?:[ \t]*[,;:–—-][ \t]*[A-Za-z][^\n]{0,40}?)?[ \t]*:?[ \t]*$`, "im");
const REQUESTOR_SECTION_HEADER = new RegExp(
  String.raw`^[ \t]*${SECTION_NUMBER}REQUES?TOR(?:[ \t]+(?:INFORMATION|INFO|DETAILS))?[ \t]*:?[ \t]*$`,
  "im",
);
// A section heading is a line of capitals only ("5. APPOINTMENT INFORMATION"). A rule line ends a section too, with or
// without text inside it ("----------", "===== CONTRACTOR AND INTERPRETER ONLY =====").
const SECTION_HEADER_PATTERN = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}[A-Z][A-Z0-9 \/&,'()-]{5,}:?[ \t]*$`);
const RULE_LINE_PATTERN = /^[ \t]*[-=_*]{3,}/;

// Artifacts of a forwarded (MIME) email. The email's own text ends at the first such line, so a section or note is
// cut off there and none of it is saved.
//  - a MIME boundary: "--000000000abc", "--_000_x", "--=_Part_1" (not a "-- " signature or a "-----" rule)
//  - a MIME header: "Content-Type: ...", "Content-Transfer-Encoding: ...", any "Content-...:"
//  - the quoted-printable "=" at the start of a line ("=", "=3D=3D...")
const MIME_BOUNDARY_PATTERN = /^[ \t]*--[^\s-]/;
const MIME_HEADER_PATTERN = /^[ \t]*Content-[A-Za-z-]+[ \t]*:/i;
const QUOTED_PRINTABLE_LINE_PATTERN = /^[ \t]*=/;
//  - the standard signature delimiter ("-- " alone on a line): everything after it is the sender's signature
const SIGNATURE_DELIMITER_PATTERN = /^[ \t]*--[ \t]*$/;
const isMimeArtifactLine = (line: string): boolean =>
  MIME_BOUNDARY_PATTERN.test(line) ||
  MIME_HEADER_PATTERN.test(line) ||
  QUOTED_PRINTABLE_LINE_PATTERN.test(line) ||
  SIGNATURE_DELIMITER_PATTERN.test(line);
/** A quoted-printable soft line break leaves a trailing "=" on the line; it is removed from kept text. */
const stripSoftLineBreak = (line: string): string => line.replace(/[ \t]*=[ \t]*$/, "");

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
  return text.replace(/^[ \t]*(?:>[ \t]*)+/gm, "");
}

/** Enforces /^[A-Za-z0-9-]{0,40}$/. Anything else is discarded rather than stored. */
export function sanitizeSrn(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim().replace(/^#/, "");
  if (trimmed.length === 0 || !SRN_ALLOWED.test(trimmed)) return null;
  return trimmed;
}

function normalizeFormat(value: string | null): AppointmentFormat | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/hybrid/.test(v)) return "hybrid";
  if (/virtual|remote|\bvri\b|video|zoom|teams|online|telehealth/.test(v)) return "virtual";
  if (/in[\s-]?person|on[\s-]?site|face[\s-]to[\s-]face|physical/.test(v)) return "in_person";
  return null;
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

/** Text of a "Label: value" line that may continue onto following lines until a blank line or the next "Label:". */
function extractNote(text: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => NOTE_START_PATTERN.test(line));
  if (start < 0) return null;
  const parts = [stripSoftLineBreak(lines[start].match(NOTE_START_PATTERN)?.[1] ?? "").trim()];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || NEXT_LABEL_PATTERN.test(line) || RULE_LINE_PATTERN.test(line) || SECTION_HEADER_PATTERN.test(line) || isMimeArtifactLine(line)) break;
    parts.push(stripSoftLineBreak(line).trim());
  }
  const note = parts.join("\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, MAX_NOTE_LENGTH);
  return note && !EMPTY_VALUE.test(note) ? note : null;
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

/** Section 5 (CLIENT/EMPLOYEE or PATIENT INFORMATION), heading plus every line in it, capped so it can't flood the notes. */
function extractClientInfoBlock(text: string): string | null {
  const lines = sectionLines(text, CLIENT_BLOCK_HEADER);
  if (!lines || lines.length === 0) return null;
  const heading = text.split("\n").map((line) => CLIENT_BLOCK_HEADER.exec(line)?.[1]).find(Boolean) ?? "CLIENT/EMPLOYEE INFORMATION";
  return [heading.replace(/\s+/g, " "), ...lines].join("\n").slice(0, MAX_CLIENT_BLOCK_LENGTH);
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

/** Requestor details: "Requestor Name/Phone/Email" lines, else Name/Phone/Email inside a REQUESTOR section. */
function extractRequestor(text: string): { name: string | null; phone: string | null; email: string | null } {
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

export function parseIntakeEmail(rawContent: string, subject: string): ParsedIntakeEmail {
  const text = normalizeEmailText(rawContent);

  // SRN: body first, then subject line as a fallback.
  let srn: string | null = null;
  for (const source of [text, subject]) {
    for (const pattern of source === subject ? [...SRN_PATTERNS, SUBJECT_SRN_PATTERN] : SRN_PATTERNS) {
      srn = sanitizeSrn(source.match(pattern)?.[1]);
      if (srn) break;
    }
    if (srn) break;
  }

  const date = cleanValue(text.match(DATE_PATTERN)?.[1]);

  let startTime = cleanValue(text.match(START_TIME_PATTERN)?.[1]);
  let endTime = cleanValue(text.match(END_TIME_PATTERN)?.[1]);
  if (!startTime) {
    const range = text.match(TIME_RANGE_PATTERN);
    startTime = cleanValue(range?.[1]);
    endTime = endTime ?? cleanValue(range?.[2]);
  }

  // Location / Address / Virtual Meeting lines, sorted into a place name, a room code, a physical address and a meeting link.
  // A forward often breaks the line after the label: the link under "Virtual Meeting/Platform:", or a link-only "Address:"
  // with the city on the line below it. Both are read here; the location parser then sorts link, platform and place.
  const meetingLine = labelValue(text, MEETING_LABELS, holdsMeeting);
  // "Virtual Meeting/Platform: TEAMS, Join:" with the link on the next line is the same thing as a link on the label's line.
  const linkBelow = meetingLine.value !== null && !holdsLink(meetingLine.value) && meetingLine.continuation !== null && holdsLink(meetingLine.continuation);
  const meeting = { value: linkBelow ? `${meetingLine.value} ${meetingLine.continuation}` : meetingLine.value };
  const addressLine = labelValue(text, ADDRESS_LABELS, holdsLink);
  const addressSplit = addressLine.value === null ? null : splitLink(addressLine.value);
  // The line below belongs to the address when the label's line holds only a link (the city follows) or only the invitation's
  // words ("Microsoft Teams meeting Join:") with the link on the next line.
  // A street broken across lines ("601 SE 117th Ave" / "Suite 240 Vancouver, Washington 98683") is one address: the unit or city
  // line is joined when it is recognisably the rest of an address and the first line is not already complete (joinAddressLines).
  const physicalJoin = addressSplit !== null && addressSplit.link === null && addressLine.value !== null ? joinAddressLines(addressLine.value, addressLine.continuation, addressLine.secondContinuation) : null;
  const addressContinues =
    addressLine.continuation !== null &&
    addressSplit !== null &&
    ((addressSplit.link !== null && addressSplit.rest === null) || (addressSplit.link === null && holdsLink(addressLine.continuation)));
  const where = resolveLocation({
    location: cleanValue(text.match(VENUE_PATTERN)?.[1]),
    address: physicalJoin ?? (addressContinues ? `${addressLine.value} ${addressLine.continuation}` : addressLine.value),
    meetingValue: meeting.value,
  });
  const { venue, locationCode, address } = where;

  let format = normalizeFormat(cleanValue(text.match(FORMAT_PATTERN)?.[1]));
  let formatInferred = false;
  if (!format && where.virtual) {
    // An online location, a platform line or a meeting link means a virtual job, even when an address (the host's) is also given.
    format = "virtual";
    formatInferred = true;
  } else if (!format && address) {
    // A physical street address with no stated format and nothing online implies an on-site job.
    format = "in_person";
    formatInferred = true;
  }

  const requestor = extractRequestor(text);

  return {
    srn,
    date,
    isoDate: date ? toIsoDate(date) : null,
    startTime,
    endTime,
    start24: startTime ? to24HourTime(startTime) : null,
    end24: endTime ? to24HourTime(endTime) : null,
    venue,
    locationCode,
    address,
    format,
    formatInferred,
    clientName: cleanValue(text.match(CLIENT_PATTERN)?.[1]),
    purpose: cleanValue(text.match(PURPOSE_PATTERN)?.[1]),
    platform: where.platform,
    meetingLink: where.meetingLink,
    appointmentNote: extractNote(text),
    requestorName: requestor.name,
    requestorPhone: requestor.phone,
    requestorEmail: requestor.email,
    clientInfoBlock: extractClientInfoBlock(text),
    clientGender: (() => {
      const gender = cleanValue(text.match(GENDER_PATTERN)?.[1])?.slice(0, 40) ?? null;
      return gender && !EMPTY_VALUE.test(gender) ? gender : null;
    })(),
  };
}

/**
 * Fixed warning labels for fields the parser could not read. Labels only: never a value from the email, so they are
 * safe to log and to return to the Lambda.
 */
export function parseWarnings(parsed: ParsedIntakeEmail): string[] {
  const warnings: string[] = [];
  if (!parsed.srn) warnings.push("SRN not found or failed sanitisation");
  if (!parsed.date) warnings.push("Appointment date not found");
  else if (!parsed.isoDate) warnings.push("Appointment date malformed");
  if (!parsed.startTime) warnings.push("Start time not found");
  else if (!parsed.start24) warnings.push("Start time malformed");
  if (parsed.endTime && !parsed.end24) warnings.push("End time malformed");
  if (!parsed.venue && !parsed.address && !parsed.locationCode) warnings.push("Location not found");
  if (!parsed.format) warnings.push("Format not found");
  else if (parsed.formatInferred) warnings.push("Format inferred as in_person from address");
  if (!parsed.clientName) warnings.push("Client name not found");
  if (!parsed.purpose) warnings.push("Purpose not found");
  if (!parsed.requestorName) warnings.push("Requestor name not found");
  if (!parsed.requestorPhone) warnings.push("Requestor phone not found");
  if (!parsed.requestorEmail) warnings.push("Requestor email not found");
  if (!parsed.clientInfoBlock) warnings.push("CLIENT/EMPLOYEE INFORMATION section not found");
  if ((parsed.format === "virtual" || parsed.format === "hybrid") && !parsed.platform && !parsed.meetingLink) {
    warnings.push("Virtual meeting platform/link not found");
  }
  return warnings;
}

/**
 * The appointment's start and end, read ONLY from the email's own Pacific wall-clock date and times (the instant is held
 * as a Date; the zone is always America/Los_Angeles, DST included). Nothing is guessed: no arrival time, no `new Date()`,
 * no "one hour after the start". Both are null unless date, start and end are all present and the end is after the start.
 */
export function appointmentTimes(parsed: ParsedIntakeEmail, warnings: string[]): { startsAt: Date | null; endsAt: Date | null } {
  if (!parsed.isoDate || !parsed.start24 || !parsed.end24) return { startsAt: null, endsAt: null };
  const startsAt = fromZonedTime(`${parsed.isoDate}T${parsed.start24}:00`, ODHH_TIME_ZONE_IANA);
  const endsAt = fromZonedTime(`${parsed.isoDate}T${parsed.end24}:00`, ODHH_TIME_ZONE_IANA);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    warnings.push("Could not compute appointment timestamps");
    return { startsAt: null, endsAt: null };
  }
  if (endsAt <= startsAt) {
    warnings.push("End time is not after start time");
    return { startsAt: null, endsAt: null };
  }
  return { startsAt, endsAt };
}

/**
 * The only way a draft job gets a schedule. Null means "not a job we can place on the calendar": the email has none of
 * the core anchors, or its date/time could not be read. The caller must then create nothing (the email stays in the Inbox).
 */
export function jobSchedule(rawContent: string, parsed: ParsedIntakeEmail, warnings: string[]): { startsAt: Date; endsAt: Date } | null {
  if (!hasJobAnchor(normalizeEmailText(rawContent))) {
    warnings.push("No appointment anchor found");
    return null;
  }
  const { startsAt, endsAt } = appointmentTimes(parsed, warnings);
  if (!startsAt || !endsAt) {
    warnings.push("Appointment date and times could not be read");
    return null;
  }
  return { startsAt, endsAt };
}
