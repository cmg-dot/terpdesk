import { EMPTY_VALUE, cleanValue, labelPattern, normalizeEmailText, parseEmailAddress, parsePhoneNumber, sectionLines } from "@/lib/odhhEmailParser";

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
}

const APPOINTMENT_SETTING = labelPattern(["Appointment[ \\t]+Setting"]);
const PLAIN_SETTING = labelPattern(["Setting"]);
const BILLING_ORG = labelPattern(["Billing[ \\t]+Organization(?:[ \\t]+Name)?"]);
const BUILDING = labelPattern(["Building"]);
const FLOOR = labelPattern(["Floor"]);
const ROOM = labelPattern(["Room"]);
const REQUESTED_INTERPRETER = labelPattern(["Specific[ \\t]+Interpreter[ \\t]+Requested"]);
const BOOKING_PERIOD = labelPattern(["Booking[ \\t]+Period"]);
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

export function parseFormExtras(rawContent: string): FormExtras {
  const text = normalizeEmailText(rawContent);
  const location = sectionLines(text, LOCATION_HEADER);
  const account = sectionLines(text, ACCOUNT_HEADER);
  return {
    setting: real(text.match(APPOINTMENT_SETTING)?.[1]) ?? real(text.match(PLAIN_SETTING)?.[1]),
    billingOrganization: real(wrappedValue(text, BILLING_ORG)),
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
