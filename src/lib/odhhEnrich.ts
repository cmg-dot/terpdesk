import { isRealOrganization } from "@/lib/requestSummary";

/**
 * Fills the blanks of an EXISTING job from the state's request email (the "form's view" from odhhDraft.ts), for jobs that
 * were imported from a spreadsheet and so lack the setting, the street address, the contacts and so on.
 *
 * Fill-only, by design: a field that already has a value is never changed, so nothing staff typed, and nothing an
 * interpreter already saw, is overwritten. Schedule fields are never touched (a different time on the form is only
 * reported). Pure: no I/O. Running it again on its own result changes nothing.
 */

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value);
const asBag = (value: unknown): Bag => (isBag(value) ? value : {});
const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/** Interpreter-visible and agency-private text fields the form may fill, as "section.field" paths. */
const FILL_ONLY = [
  "details.setting",
  "details.purpose",
  "details.format",
  "details.formatCode",
  "details.platform",
  "details.meetingLink",
  "details.virtualLink",
  "details.deafParticipant",
  "requester.name",
  "requester.phone",
  "requester.email",
  "requester.billOrg",
  "requester.billContact",
  "requester.billEmail",
  "requester.billPhone",
  "onsite.address",
  "onsite.building",
  "onsite.floor",
  "onsite.room",
  "onsite.contact",
  "onsite.contactMethod",
  "intake.requestedInterpreter",
  "intake.bookingPeriod",
] as const;

/** Yes/no flags from the form: set when the form says yes and the job has not already got it. */
const FLAGS = ["intake.preAuthorizationRequired", "intake.crucialAppointment"] as const;

export interface EnrichmentPlan {
  data: Bag;
  /** The names of the fields that were filled (never their values), for the activity log. */
  changed: string[];
  /** The form's start or end differs from the job's. Reported to staff, never applied. */
  scheduleDiffers: boolean;
  /** The form says virtual where the job says in person (or the other way round). Reported to staff, never applied. */
  formatDiffers: boolean;
}

/** "virtual" / "in_person" / "hybrid" from a job's saved format code, or its label ("In person", "Virtual"). */
const formatKind = (details: Bag): string => {
  const code = text(details.formatCode).toLowerCase();
  if (code) return code;
  const label = text(details.format).toLowerCase();
  return label.includes("hybrid") ? "hybrid" : label.includes("virtual") ? "virtual" : label.includes("in person") || label.includes("in-person") ? "in_person" : "";
};

/**
 * "Puyallup" is a bare place name inside the venue "Puyallup Tribal Health Authority". Only the venue's own name counts: a city
 * that merely appears in the street address ("sound" at "... Seattle") is not a reason to replace the city already on the job.
 */
const isBarePlaceOf = (existing: string, venue: string): boolean => {
  const bare = existing.toLowerCase();
  return bare !== "" && venue.toLowerCase().includes(bare) && venue.toLowerCase() !== bare;
};

export interface ExistingJob {
  status: string;
  data: Bag;
  /** The row's createdAt: the appointment start across the app. */
  startsAt: Date;
}

export function planEnrichment(existing: ExistingJob, form: Bag): EnrichmentPlan {
  const next: Bag = { ...existing.data };
  const changed: string[] = [];
  const section = (name: string): Bag => {
    const copy = { ...asBag(next[name]) };
    next[name] = copy;
    return copy;
  };
  const formSection = (name: string): Bag => asBag(form[name]);

  if (existing.status === "Cancelled") return { data: existing.data, changed, scheduleDiffers: false, formatDiffers: false };

  for (const path of FILL_ONLY) {
    const [sectionName, field] = path.split(".");
    const incoming = text(formSection(sectionName)[field]);
    // The forwarding address stands in as the requester's email when the form names none: not a fact about the job.
    if (path === "requester.email" && incoming === text(asBag(form.source).fromEmail)) continue;
    if (!incoming || text(asBag(existing.data[sectionName])[field])) continue;
    section(sectionName)[field] = formSection(sectionName)[field];
    changed.push(path);
  }

  for (const path of FLAGS) {
    const [sectionName, field] = path.split(".");
    if (formSection(sectionName)[field] === true && asBag(existing.data[sectionName])[field] !== true) {
      section(sectionName)[field] = true;
      changed.push(path);
    }
  }

  // The organization: only a real one from the form, and only where the job has none (or a funding-program placeholder).
  const incomingOrg = text(formSection("requester").org);
  const currentOrg = text(asBag(existing.data.requester).org);
  if (isRealOrganization(incomingOrg) && !isRealOrganization(currentOrg)) {
    section("requester").org = incomingOrg;
    changed.push("requester.org");
  }

  // The place: a street address fills in, and a bare place name ("Puyallup") becomes the full venue.
  const venue = text(formSection("onsite").venue);
  const currentVenue = text(asBag(existing.data.onsite).venue);
  let place: string | null = null;
  if (venue && !currentVenue) place = venue;
  else if (venue && currentVenue !== venue && isBarePlaceOf(currentVenue, venue)) place = venue;
  if (place) {
    section("onsite").venue = place;
    changed.push("onsite.venue");
    if (text(asBag(next.overview).location) !== place) section("overview").location = place;
    next.location = place;
  }

  // Notes: only into the agency-private notes, and only by adding what is not there yet (the state's flags and section 5),
  // never by changing what staff wrote. The appointment note goes in only when the private notes are empty. It is not
  // copied into preparation notes here: a booked interpreter may already have read them.
  const currentPrivate = text(existing.data.privateNotes);
  const block = text(form.privateNotes);
  const note = text(form.prepNotes);
  const additions = [
    !currentPrivate && note ? `Appointment note (state form): ${note}` : "",
    block && !currentPrivate.includes(block) ? block : "",
  ].filter(Boolean);
  if (additions.length > 0) {
    next.privateNotes = [currentPrivate, ...additions].filter(Boolean).join("\n\n");
    changed.push("privateNotes");
  }

  if (!isBag(existing.data.source) && isBag(form.source)) {
    next.source = form.source;
    changed.push("source");
  }

  const formSchedule = formSection("schedule");
  const startsAt = text(formSchedule.startsAt);
  const endsAt = text(formSchedule.endsAt);
  const existingEnd = text(asBag(existing.data.schedule).endsAt);
  const scheduleDiffers =
    (startsAt !== "" && new Date(startsAt).getTime() !== existing.startsAt.getTime()) ||
    (endsAt !== "" && existingEnd !== "" && new Date(endsAt).getTime() !== new Date(existingEnd).getTime());

  const formKind = formatKind(formSection("details"));
  const jobKind = formatKind(asBag(existing.data.details));
  const formatDiffers = formKind !== "" && jobKind !== "" && formKind !== jobKind;

  return { data: changed.length > 0 ? next : existing.data, changed, scheduleDiffers, formatDiffers };
}
