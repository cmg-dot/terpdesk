import { type Program } from "@/db/schema";
import { labelValue } from "@/lib/odhhLabelValue";
import { joinAddressLines, platformFrom, resolveLocation, splitLink } from "@/lib/odhhLocationParse";
import { cleanValue, EMPTY_VALUE } from "@/lib/odhhText";
import { SRN_PATTERNS, TIME_FRAGMENT, labelPattern, normalizeEmailText, sanitizeSrn, to24HourTime, toIsoDate } from "@/lib/odhhEmailText";
import { extractClientInfoBlock, extractNote, extractRequestor } from "@/lib/odhhEmailSections";

// Kept importable from here: other parsers read these helpers from this module (they live in odhhEmailText.ts / odhhSchedule.ts).
export { cleanValue, EMPTY_VALUE };
export { SRN_PATTERNS, TIME_FRAGMENT, endsLabelBlock, labelPattern, normalizeEmailText, parseEmailAddress, parsePhoneNumber, sanitizeSrn, sectionLines, stripSoftLineBreak, to24HourTime, toIsoDate } from "@/lib/odhhEmailText";
export { JOB_ANCHOR_PATTERNS, ODHH_TIME_ZONE_IANA, appointmentTimes, hasJobAnchor, jobSchedule } from "@/lib/odhhSchedule";

/**
 * Parser for forwarded ODHH dispatch emails (pure functions, no I/O). Used by the /api/intake webhook.
 * Matching is line-anchored "Label: value", case-insensitive, and tolerant of extra whitespace and HTML bodies.
 */

// Must match the schema's Program union (frontend checks program === 'WA ODHH').
export const ODHH_PROGRAM: Program = "WA ODHH";
export const ODHH_TIME_ZONE_LABEL = "Pacific Time — Seattle, Los Angeles";

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

// Only the appointment's own date. A bare "Date:" line is the forwarded message's header ("Date: 11/02/2026 11:45 AM PST",
// the day it was SENT), and "Date of Interpreter Request - ..." is the day it was requested: neither is the appointment.
const DATE_LABEL = String.raw`(?:Appointment|Service)[ \t]+Date`;
const DATE_PATTERN = new RegExp(String.raw`^[ \t]*${DATE_LABEL}[ \t]*:[ \t]*(\d{1,2}\/\d{1,2}\/\d{2,4})\b`, "im");
const US_DATE_START = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
// The same number as it appears in a subject: "Interpreter Request - 12/7/2026 - #202786930".
const SUBJECT_SRN_PATTERN = /#[ \t]*(\d{6,12})\b/;

const START_LABEL = String.raw`(?:Appointment[ \t]+)?Start[ \t]+Time`;
const END_LABEL = String.raw`(?:Appointment[ \t]+)?End[ \t]+Time`;
const START_TIME_PATTERN = new RegExp(String.raw`^[ \t]*${START_LABEL}[ \t]*:[ \t]*(${TIME_FRAGMENT})`, "im");
const END_TIME_PATTERN = new RegExp(String.raw`^[ \t]*${END_LABEL}[ \t]*:[ \t]*(${TIME_FRAGMENT})`, "im");
const TIME_START = new RegExp(String.raw`^(${TIME_FRAGMENT})`);
// Fallback for a single line such as "Time: 8:00 AM - 9:00 AM".
const TIME_RANGE_PATTERN = new RegExp(
  String.raw`^[ \t]*(?:Appointment[ \t]+)?Time[ \t]*:[ \t]*(${TIME_FRAGMENT})[ \t]*(?:-|–|—|to)[ \t]*(${TIME_FRAGMENT})`,
  "im"
);

const VENUE_PATTERN = labelPattern(["Location", "Location[ \\t]+Name", "Venue", "Facility"]);
const ADDRESS_LABELS = ["Address", "Location[ \\t]+Address", "Street[ \\t]+Address"] as const;
const FORMAT_PATTERN = labelPattern(["Format", "Service[ \\t]+Format", "Modality", "Service[ \\t]+Type", "Appointment[ \\t]+Type", "Delivery[ \\t]+Method"]);
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

function normalizeFormat(value: string | null): AppointmentFormat | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (/hybrid/.test(v)) return "hybrid";
  if (/virtual|remote|\bvri\b|video|zoom|teams|online|telehealth/.test(v)) return "virtual";
  if (/in[\s-]?person|on[\s-]?site|face[\s-]to[\s-]face|physical/.test(v)) return "in_person";
  return null;
}

/**
 * A "Label: value" whose value is on the line BELOW the label ("Appointment Date:" then "11/12/2026"): the part of that value
 * `start` reads (a date, a time), or null. Used only when the value is not on the label's own line.
 */
function valueBelow(text: string, label: string, start: RegExp): string | null {
  const found = labelValue(text, [label], (line) => start.test(line.trim())).value;
  return found ? cleanValue(start.exec(found)?.[1]) : null;
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

  const date = cleanValue(text.match(DATE_PATTERN)?.[1]) ?? valueBelow(text, DATE_LABEL, US_DATE_START);

  let startTime = cleanValue(text.match(START_TIME_PATTERN)?.[1]) ?? valueBelow(text, START_LABEL, TIME_START);
  let endTime = cleanValue(text.match(END_TIME_PATTERN)?.[1]) ?? valueBelow(text, END_LABEL, TIME_START);
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
  const gender = cleanValue(text.match(GENDER_PATTERN)?.[1])?.slice(0, 40) ?? null;

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
    clientGender: gender && !EMPTY_VALUE.test(gender) ? gender : null,
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
