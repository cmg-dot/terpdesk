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
] as const;

export interface EnrichmentPlan {
  data: Bag;
  /** The names of the fields that were filled (never their values), for the activity log. */
  changed: string[];
  /** The form's start or end differs from the job's. Reported to staff, never applied. */
  scheduleDiffers: boolean;
}

/** "Puyallup" is a bare place name inside "Puyallup Tribal Health Authority" or its street address. */
const isBarePlaceOf = (existing: string, venue: string, address: string): boolean => {
  const bare = existing.toLowerCase();
  if (!bare) return false;
  return [venue, address].some((fuller) => fuller.toLowerCase().includes(bare) && fuller.toLowerCase() !== bare);
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

  if (existing.status === "Cancelled") return { data: existing.data, changed, scheduleDiffers: false };

  for (const path of FILL_ONLY) {
    const [sectionName, field] = path.split(".");
    const incoming = text(formSection(sectionName)[field]);
    // The forwarding address stands in as the requester's email when the form names none: not a fact about the job.
    if (path === "requester.email" && incoming === text(asBag(form.source).fromEmail)) continue;
    if (!incoming || text(asBag(existing.data[sectionName])[field])) continue;
    section(sectionName)[field] = formSection(sectionName)[field];
    changed.push(path);
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
  const address = text(formSection("onsite").address);
  const currentVenue = text(asBag(existing.data.onsite).venue);
  let place: string | null = null;
  if (venue && !currentVenue) place = venue;
  else if (venue && currentVenue !== venue && isBarePlaceOf(currentVenue, venue, address)) place = venue;
  if (place) {
    section("onsite").venue = place;
    changed.push("onsite.venue");
    if (text(asBag(next.overview).location) !== place) section("overview").location = place;
    next.location = place;
  }

  // Notes: only into the agency-private notes, and only when they are empty. The appointment note is not copied into
  // preparation notes here: a booked interpreter may already have read them.
  if (!text(existing.data.privateNotes)) {
    const note = text(form.prepNotes);
    const block = text(form.privateNotes);
    const combined = [note ? `Appointment note (state form): ${note}` : "", block].filter(Boolean).join("\n\n");
    if (combined) {
      next.privateNotes = combined;
      changed.push("privateNotes");
    }
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

  return { data: changed.length > 0 ? next : existing.data, changed, scheduleDiffers };
}
