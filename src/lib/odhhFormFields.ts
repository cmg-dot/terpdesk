import { EMPTY_VALUE, cleanValue, endsLabelBlock, labelPattern, normalizeEmailText, parseEmailAddress, parsePhoneNumber, sectionLines, stripSoftLineBreak } from "@/lib/odhhEmailParser";

/**
 * More of what the state's request form says, beyond the schedule and the venue: the appointment setting, the billing
 * organization (DVR, Seattle Children's, ...), the building / floor / room, and the contacts. Pure functions on the email
 * text. Kept apart from the main parser so each stays small; it only reads, never guesses (a missing line is null).
 */

export interface FormExtras {
  /** "Job Interview", "ODHH: DIRECTOR'S MEETING": the form's own words, not a made-up category. */
  setting: string | null;
  /** Who the job is for ("Billing Organization Name"). */
  billingOrganization: string | null;
  /**
   * "Requestor Location" in section 1: usually the requester's city ("Olympia"), sometimes the organization itself ("Seattle Children's
   * Hospital") when the billing organization is left blank. See stateOrganization.ts for when it counts as the organization.
   */
  requestorLocation: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  /** The on-site contact under "4. APPOINTMENT LOCATION". */
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactText: string | null;
  /** The billing contact under "2. ACCOUNT INFORMATION". */
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactPhone: string | null;
  /** "Specific Interpreter Requested" in section 5: a preference to honour, not a booking. */
  requestedInterpreter: string | null;
  /** "THIS REQUEST REQUIRES PRE-AUTHORIZATION" (the state's banner above section 1). */
  preAuthorizationRequired: boolean;
  /** The "3. APPOINTMENT INFORMATION - Crucial Appointment" heading. */
  crucialAppointment: boolean;
  /** "Booking Period: 72 Hours". */
  bookingPeriod: string | null;
  /** "Direction & Parking Note: CODE 793775" under "4. APPOINTMENT LOCATION" (directions, a gate code, where to park). */
  parking: string | null;
  /** "Public - Yes/No" and "Mixed Group - Yes/No" under "4. APPOINTMENT LOCATION": null when the form does not say. */
  isPublic: boolean | null;
  isMixedGroup: boolean | null;
}

const APPOINTMENT_SETTING = labelPattern(["Appointment[ \\t]+Setting"]);
const PLAIN_SETTING = labelPattern(["Setting"]);
const BILLING_ORG = labelPattern(["Billing[ \\t]+Organization(?:[ \\t]+Name)?"]);
const REQUESTOR_LOCATION = labelPattern(["Request(?:o|e)r[ \\t]+Location"]);
const BUILDING = labelPattern(["Building"]);
const FLOOR = labelPattern(["Floor"]);
const ROOM = labelPattern(["Room"]);
const REQUESTED_INTERPRETER = labelPattern(["Specific[ \\t]+Interpreter[ \\t]+Requested"]);
const BOOKING_PERIOD = labelPattern(["Booking[ \\t]+Period"]);
// Only the form's own label ("Direction & Parking Note"): a bare "Parking:" elsewhere in a forwarded email is not this field. The
// value may be empty on the label's line and start on the next one.
const PARKING_NOTE_START = /^[ \t]*(?:Directions?[ \t]*(?:&|&amp;|and)[ \t]*Parking(?:[ \t]+Notes?)?|Parking[ \t]+(?:&|and)[ \t]+Directions?)[ \t]*:[ \t]*(.*)$/i;
const MAX_PARKING_NOTE = 1000;
/** The form prints these two as "Public - No" (a dash, not a colon). */
const yesNoLine = (label: string): RegExp => new RegExp(String.raw`^[ \t]*${label}[ \t]*[-:–—][ \t]*(Yes|No)\b`, "im");
const PUBLIC_LINE = yesNoLine("Public");
const MIXED_GROUP_LINE = yesNoLine("Mixed[ \\t]+Group");
const yesNo = (match: RegExpMatchArray | null): boolean | null => (match ? match[1].toLowerCase() === "yes" : null);
const PRE_AUTHORIZATION = /^[ \t]*THIS[ \t]+REQUEST[ \t]+REQUIRES[ \t]+PRE-?[ \t]*AUTHORI[SZ]ATION\b/im;
const CRUCIAL_APPOINTMENT = /^[ \t]*(?:\d{1,2}[.)][ \t]*)?APPOINTMENT[ \t]+INFORMATION[ \t]*[-:–—][ \t]*Crucial[ \t]+Appointment\b/im;
const SECTION = String.raw`(?:\d{1,2}[.)][ \t]*)?`;
const LOCATION_HEADER = new RegExp(String.raw`^[ \t]*${SECTION}APPOINTMENT[ \t]+LOCATION[ \t]*:?[ \t]*$`, "im");
const ACCOUNT_HEADER = new RegExp(String.raw`^[ \t]*${SECTION}ACCOUNT[ \t]+INFORMATION[ \t]*:?[ \t]*$`, "im");

/** A real value, or null for blank / "N/A" / "None". */
const real = (value: string | undefined | null): string | null => {
  const cleaned = cleanValue(value ?? undefined);
  return cleaned && !EMPTY_VALUE.test(cleaned) ? cleaned : null;
};

/** The value of "Label: value" among a section's lines. */
const inSection = (lines: string[] | null, label: string): string | null => {
  const pattern = new RegExp(String.raw`^${label}[ \t]*:[ \t]*(.*)$`, "i");
  for (const line of lines ?? []) {
    const match = pattern.exec(line);
    if (match) return real(match[1]);
  }
  return null;
};

/**
 * A "Label: value" the form wrapped onto its next line ("Department of Services for the Blind - Vancouver -" then
 * "Thompson"): joined only when the first line ends in a dash and the next line is short and is not itself a "Label:" line.
 */
const wrappedValue = (text: string, pattern: RegExp): string | undefined => {
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = match[1];
  if (!/[-–—]$/.test(value.trim())) return value;
  const next = (text.slice(match.index + match[0].length).split("\n")[1] ?? "").trim();
  return next !== "" && next.length <= 80 && !next.includes(":") ? `${value.trim()} ${next}` : value;
};

/**
 * The Direction & Parking note in full: the label's line and every line under it up to a blank line, the next "Label:", a section
 * heading or a rule (the form wraps a long note over several lines, and a gate code or a second paragraph of directions sits there).
 */
const parkingNote = (text: string): string | null => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => PARKING_NOTE_START.test(line));
  if (start < 0) return null;
  const parts = [stripSoftLineBreak(PARKING_NOTE_START.exec(lines[start])?.[1] ?? "")];
  // With an empty label line the note simply starts on the next one; a blank line or another label still ends it. Directions are
  // often typed in capitals, so only a numbered heading ends the note, not any line in capitals.
  for (let i = start + 1; i < lines.length && !endsLabelBlock(lines[i], { numberedHeadersOnly: true }); i += 1) parts.push(stripSoftLineBreak(lines[i]));
  // Line breaks are kept (cleanValue would join the lines and cut the note at 300 characters); spacing inside a line is squashed.
  const note = parts.map((part) => part.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n").slice(0, MAX_PARKING_NOTE);
  return note && !EMPTY_VALUE.test(note) ? note : null;
};

export function parseFormExtras(rawContent: string): FormExtras {
  const text = normalizeEmailText(rawContent);
  const location = sectionLines(text, LOCATION_HEADER);
  const account = sectionLines(text, ACCOUNT_HEADER);
  return {
    setting: real(text.match(APPOINTMENT_SETTING)?.[1]) ?? real(text.match(PLAIN_SETTING)?.[1]),
    billingOrganization: real(wrappedValue(text, BILLING_ORG)),
    requestorLocation: real(text.match(REQUESTOR_LOCATION)?.[1]),
    building: real(text.match(BUILDING)?.[1]),
    floor: real(text.match(FLOOR)?.[1]),
    room: real(text.match(ROOM)?.[1]),
    contactName: inSection(location, "Contact"),
    contactPhone: parsePhoneNumber(inSection(location, "Phone")),
    contactEmail: parseEmailAddress(inSection(location, "Email")),
    contactText: parsePhoneNumber(inSection(location, "Text")),
    billingContactName: inSection(account, "Contact"),
    billingContactEmail: parseEmailAddress(inSection(account, "Email")),
    billingContactPhone: parsePhoneNumber(inSection(account, "Phone")),
    requestedInterpreter: real(text.match(REQUESTED_INTERPRETER)?.[1]),
    preAuthorizationRequired: PRE_AUTHORIZATION.test(text),
    crucialAppointment: CRUCIAL_APPOINTMENT.test(text),
    bookingPeriod: real(text.match(BOOKING_PERIOD)?.[1]),
    parking: parkingNote(text),
    isPublic: yesNo(text.match(PUBLIC_LINE)),
    isMixedGroup: yesNo(text.match(MIXED_GROUP_LINE)),
  };
}

/**
 * The state's flags for a job as one line for the agency-private notes ("Requires pre-authorization · Crucial appointment ·
 * Booking period: 72 Hours"), or "" when it has none.
 */
export const stateFlagsLine = (extras: Pick<FormExtras, "preAuthorizationRequired" | "crucialAppointment" | "bookingPeriod">): string => {
  const parts = [
    extras.preAuthorizationRequired ? "Requires pre-authorization" : "",
    extras.crucialAppointment ? "Crucial appointment" : "",
    extras.bookingPeriod ? `Booking period: ${extras.bookingPeriod}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `State request flags: ${parts.join(" · ")}` : "";
};

/** How the on-site contact is reached, as one line: "360-555-0100 · a@b.gov · text 360-555-0101". */
export const contactMethodText = (extras: Pick<FormExtras, "contactPhone" | "contactEmail" | "contactText">): string =>
  [extras.contactPhone, extras.contactEmail, extras.contactText ? `text ${extras.contactText}` : null].filter(Boolean).join(" · ");
