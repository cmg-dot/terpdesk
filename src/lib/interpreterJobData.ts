import { settingLabel } from "@/lib/settingLabel";

/**
 * What an interpreter's browser may receive about a job. The raw `requests.data` holds staff-only material (the client's
 * name, agency-private notes with the state's section 5, the original forwarded email, the requester and billing
 * contacts, ProviderOne and ODHH access codes, the requested interpreter, the state's flags, other interpreters' questions
 * and hours), so nothing is copied from it wholesale.
 *
 * ALLOWLIST: the result is built field by field from the names below. A key added to `requests.data` later is never sent
 * until someone adds it here on purpose, which is the safe way round for a HIPAA-minded app.
 *
 * Two levels of access:
 *  - "offer"  (a pending offer, or anything that is not a live booking): the schedule, format, a generic setting, the
 *    platform's name and the place's name only. No street address, building, room, floor, parking, entrance, contact,
 *    meeting link, meeting id, passcode or instructions: those are shared after the interpreter accepts.
 *  - "booked" (an accepted booking): the above plus the full place, the virtual meeting details and the preparation notes.
 */

type Loose = Record<string, unknown>;
export type JobAccess = "offer" | "booked";

const isObject = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const asObject = (value: unknown): Loose => (isObject(value) ? value : {});
const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
const orNull = (value: unknown): string | null => text(value) || null;

/** `details` fields the interpreter screens read for the schedule. */
const SCHEDULE_KEYS = ["startDate", "startTime", "endDate", "endTime"] as const;
/** `onsite` fields shared only after acceptance. */
const PLACE_KEYS = ["address", "building", "floor", "room", "parking", "entrance", "contact", "contactMethod"] as const;

export interface InterpreterJobView {
  setting: string;
  format: string;
  isVirtual: boolean;
  location: string;
  platform: string | null;
  meetingLink: string | null;
  meetingId: string | null;
  passcode: string | null;
  virtualInstructions: string | null;
  /** The agency's preparation notes for interpreters (never the agency-private notes). Shared once booked. */
  prepNotes: string;
  /** An offer for a job that has meeting credentials, which stay on the server until the offer is accepted. */
  credentialsLocked: boolean;
  details: Loose;
  onsite: Record<string, string>;
  /** Only the program and the SRN (the interpreter's own link to the state's portal). */
  data: { intake: { program?: string; odhhSrn?: string } };
}

export function interpreterJobView(requestData: unknown, access: JobAccess): InterpreterJobView {
  const data = asObject(requestData);
  const details = asObject(data.details);
  const onsite = asObject(data.onsite);
  const intake = asObject(data.intake);
  const booked = access === "booked";

  const rawFormat = text(details.format) || text(data.format);
  const venue = text(onsite.venue);
  const format = rawFormat || (venue && !venue.toLowerCase().includes("virtual") ? "In person" : "Virtual");
  const isVirtual = format.toLowerCase().includes("virtual");
  const setting = settingLabel(data.setting, details.setting);
  const timeZone = text(details.timeZone) || "America/Los_Angeles";

  const link = text(details.meetingLink) || text(details.virtualLink) || text(data.meetingLink) || text(data.virtualLink);
  const meetingId = text(details.meetingId) || text(data.meetingId);
  const passcode = text(details.passcode) || text(details.accessCode) || text(data.passcode) || text(data.accessCode);
  const instructions = text(details.virtualInstructions) || text(details.instructions) || text(data.virtualInstructions);
  const lower = link.toLowerCase();
  const platform =
    text(details.platform) || text(data.platform) || (lower.includes("zoom") ? "Zoom" : lower.includes("teams") ? "Microsoft Teams" : lower.includes("meet.google") ? "Google Meet" : "Virtual");

  const place = (key: (typeof PLACE_KEYS)[number]): string => (booked ? text(onsite[key]) : "");
  const onsiteView: Record<string, string> = { venue: venue || (isVirtual ? "Virtual" : "Location pending") };
  for (const key of PLACE_KEYS) onsiteView[key] = place(key);

  const virtualLabel = platform ? `${platform} (Virtual)` : "Virtual";
  const bookedPlace = venue ? (text(onsite.address) ? `${venue} · ${text(onsite.address)}` : venue) : text(onsite.address);
  const location = isVirtual
    ? text(data.location) && booked ? text(data.location) : virtualLabel
    : booked
      ? text(data.location) || bookedPlace || "Location pending"
      : venue || "Location shared after you accept";

  const schedule: Loose = {};
  for (const key of SCHEDULE_KEYS) if (text(details[key])) schedule[key] = text(details[key]);

  const virtualFields: Loose = booked
    ? { meetingLink: orNull(link), virtualLink: orNull(link), meetingId: orNull(meetingId), passcode: orNull(passcode), accessCode: orNull(passcode), virtualInstructions: orNull(instructions) }
    : {};

  return {
    setting,
    format,
    isVirtual,
    location,
    platform: isVirtual ? platform : orNull(details.platform),
    meetingLink: booked ? orNull(link) : null,
    meetingId: booked ? orNull(meetingId) : null,
    passcode: booked ? orNull(passcode) : null,
    virtualInstructions: booked ? orNull(instructions) : null,
    prepNotes: booked ? text(data.prepNotes) : "",
    credentialsLocked: !booked && isVirtual && Boolean(link || meetingId || passcode),
    details: { ...schedule, setting, format, timeZone, platform: isVirtual ? platform : orNull(details.platform), ...virtualFields },
    onsite: onsiteView,
    data: {
      intake: {
        ...(text(intake.program) ? { program: text(intake.program) } : {}),
        ...(text(intake.odhhSrn) ? { odhhSrn: text(intake.odhhSrn) } : {}),
      },
    },
  };
}
