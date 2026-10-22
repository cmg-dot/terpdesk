import { type Program } from "@/db/schema";

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
const MAX_FIELD_LENGTH = 300;

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
  venue: string | null;
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

const TIME_FRAGMENT = String.raw`\d{1,2}(?::\d{2})?\s*[AaPp]\.?\s*[Mm]\.?`;

const SRN_PATTERNS: readonly RegExp[] = [
  /Service\s+Request\s*(?:#|No\.?|Number)\s*:?\s*#?\s*([A-Za-z0-9-]+)/i,
  /\bSRN\s*[:#]?\s*#?\s*([A-Za-z0-9-]+)/i,
];
const DATE_PATTERN = /^[ \t]*(?:Appointment[ \t]+|Service[ \t]+)?Date[ \t]*:[ \t]*(\d{1,2}\/\d{1,2}\/\d{2,4})/im;
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
function labelPattern(labels: readonly string[]): RegExp {
  return new RegExp(String.raw`^[ \t]*(?:${labels.join("|")})[ \t]*:[ \t]*(.+?)[ \t]*$`, "im");
}

const VENUE_PATTERN = labelPattern(["Location", "Location[ \\t]+Name", "Venue", "Facility"]);
const ADDRESS_PATTERN = labelPattern(["Address", "Location[ \\t]+Address", "Street[ \\t]+Address"]);
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

const MEETING_PATTERN = labelPattern([
  "Virtual[ \t]+Meeting(?:[ \t]+(?:Platform|Link|URL|Information|Info))?",
  "Virtual[ \t]+(?:Platform|Link)",
  "Meeting[ \t]+(?:Platform|Link|URL)",
  "Video[ \t]+(?:Platform|Link)",
  "Platform",
]);
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
const CLIENT_BLOCK_HEADER = new RegExp(String.raw`^[ \t]*${SECTION_NUMBER}CLIENT[ \t]*\/[ \t]*EMPLOYEE[ \t]+INFORMATION[ \t]*:?[ \t]*$`, "im");
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
const EMPTY_VALUE = /^(?:n\/?a|none|no|not applicable|not provided|-+)$/i;

/** Lambda may forward HTML bodies — flatten to plain text lines before matching. */
function normalizeEmailText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
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
  return text;
}

function cleanValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** Enforces /^[A-Za-z0-9-]{0,40}$/. Anything else is discarded rather than stored. */
function sanitizeSrn(candidate: string | undefined): string | null {
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
function toIsoDate(usDate: string): string | null {
  const m = usDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "8:00 AM" | "8 am" | "12:30 p.m." -> "08:00" | "08:00" | "12:30" */
function to24HourTime(time12: string): string | null {
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
function sectionLines(text: string, header: RegExp): string[] | null {
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

/** The CLIENT/EMPLOYEE INFORMATION section, heading plus every line in it, capped so it can't flood the notes. */
function extractClientInfoBlock(text: string): string | null {
  const lines = sectionLines(text, CLIENT_BLOCK_HEADER);
  if (!lines || lines.length === 0) return null;
  return ["CLIENT/EMPLOYEE INFORMATION", ...lines].join("\n").slice(0, MAX_CLIENT_BLOCK_LENGTH);
}

/** First e-mail address in the value (a trailing "mailto:", brackets or punctuation are ignored). */
function parseEmailAddress(value: string | null): string | null {
  if (!value) return null;
  const found = value.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/);
  return found ? found[0].toLowerCase().slice(0, 120) : null;
}

/** The first phone number in the value, as written (with any extension), when it has at least 7 digits. */
function parsePhoneNumber(value: string | null): string | null {
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

/** Known video platforms by hostname or name; anything else keeps the text the email gave. */
function platformFrom(value: string): string | null {
  if (/zoom/i.test(value)) return "Zoom";
  if (/teams/i.test(value)) return "Microsoft Teams";
  if (/meet\.google|google\s*meet/i.test(value)) return "Google Meet";
  if (/webex/i.test(value)) return "Webex";
  return null;
}

/** "Virtual Meeting: Zoom https://..." -> platform "Zoom" + link. Only http(s) links are ever kept. */
function parseMeeting(value: string | null): { platform: string | null; meetingLink: string | null } {
  if (!value || EMPTY_VALUE.test(value)) return { platform: null, meetingLink: null };
  const url = value.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;)]+$/, "") ?? null;
  const label = cleanValue(url ? value.replace(url, "") : value)?.replace(/[:\-–—\s]+$/, "") ?? null;
  // Free text is kept as the platform name only if it isn't a URL-like value ("javascript:...", "file:...").
  const plainLabel = label && !EMPTY_VALUE.test(label) && !/^[a-z][a-z0-9+.-]*:\S/i.test(label) ? label.slice(0, 80) : null;
  const platform = platformFrom(url ?? "") ?? platformFrom(label ?? "") ?? plainLabel;
  return { platform: platform ?? (url ? "Virtual" : null), meetingLink: url };
}

export function parseIntakeEmail(rawContent: string, subject: string): ParsedIntakeEmail {
  const text = normalizeEmailText(rawContent);

  // SRN: body first, then subject line as a fallback.
  let srn: string | null = null;
  for (const source of [text, subject]) {
    for (const pattern of SRN_PATTERNS) {
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

  const venue = cleanValue(text.match(VENUE_PATTERN)?.[1]);
  const address = cleanValue(text.match(ADDRESS_PATTERN)?.[1]);

  const meeting = parseMeeting(cleanValue(text.match(MEETING_PATTERN)?.[1]));

  let format = normalizeFormat(cleanValue(text.match(FORMAT_PATTERN)?.[1]));
  let formatInferred = false;
  if (!format && address) {
    // A physical street address with no stated format implies an on-site job.
    format = "in_person";
    formatInferred = true;
  } else if (!format && (meeting.platform || meeting.meetingLink)) {
    // A meeting platform or link and no street address implies a virtual job.
    format = "virtual";
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
    address,
    format,
    formatInferred,
    clientName: cleanValue(text.match(CLIENT_PATTERN)?.[1]),
    purpose: cleanValue(text.match(PURPOSE_PATTERN)?.[1]),
    platform: meeting.platform,
    meetingLink: meeting.meetingLink,
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
