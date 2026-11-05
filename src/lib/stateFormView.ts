import { formatInTimeZone } from "date-fns-tz";
import { hasJobAnchor, normalizeEmailText } from "@/lib/odhhEmailParser";
import { isRealOrganization } from "@/lib/requestSummary";
import { identityLabel } from "@/lib/hearingIdentity";
import { rowsFromLines, parseStateFormEmail } from "@/lib/stateFormParse";
import { splitSection5 } from "@/lib/section5Notes";
import { PRE_AUTHORIZATION_BANNER } from "@/lib/stateFormTypes";
import type { FormRow, FormSection, StateFormView } from "@/lib/stateFormTypes";
import { getIanaZone } from "@/utils/timezone";

/**
 * The request page's form: the state's own email when the job has it saved, otherwise the same five sections built from what
 * the job has on file, with anything missing left as null ("Not on file" on screen). Pure.
 */

type Bag = Record<string, unknown>;
const bag = (value: unknown): Bag => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Bag) : {});
const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
const orNull = (value: unknown): string | null => text(value) || null;

export interface StateFormInput {
  /** The job's saved data (requests.data). */
  data: unknown;
  startsAt: string | null;
  endsAt: string | null;
  /** The job's time zone (an IANA name or the app's own label). */
  timeZone: string | undefined;
}


/**
 * The agency-private notes without the saved copy of section 5. The request form on the same page already shows that section
 * (staff only), so repeating it in the notes card would show the person's details twice. It is dropped only when the form
 * really shows a section 5 with rows in it, so nothing can disappear from the page. What staff wrote, and the state's flags
 * line, are kept.
 */
export function notesWithoutFormSection5(privateNotes: string, view: StateFormView): string {
  if (!view.sections.some((section) => section.number === 5 && section.rows.length > 0)) return privateNotes;
  const { general, block } = splitSection5(privateNotes);
  return block ? general : privateNotes;
}

/** "Label: value" lines of section 5 as the app saved them in the private notes (every saved copy merged), or null. */
const savedSection5 = (privateNotes: string): { title: string; lines: string[] } | null => splitSection5(privateNotes).block;

const clock = (iso: string | null, zone: string, pattern: string): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatInTimeZone(date, zone, pattern);
};

const row = (label: string, value: unknown): FormRow => ({ label, value: orNull(value) });

/** Rows from a saved section 5 block, with the form-saved details filled in where the block has none (or no such row). */
function withPatientDetails(rows: FormRow[], details: [string, string][]): FormRow[] {
  const next = rows.map((r) => ({ ...r }));
  for (const [label, value] of details) {
    if (!value) continue;
    const at = next.findIndex((r) => r.label.toLowerCase().replace(/[^a-z0-9#]/g, "") === label.toLowerCase().replace(/[^a-z0-9#]/g, ""));
    if (at < 0) next.push({ label, value });
    else if (!next[at].value) next[at].value = value;
  }
  return next;
}

const yesNo = (value: unknown): string | null => (typeof value === "boolean" ? (value ? "Yes" : "No") : null);

function recordsView(input: StateFormInput): StateFormView {
  const data = bag(input.data);
  const intake = bag(data.intake);
  const details = bag(data.details);
  const onsite = bag(data.onsite);
  const requester = bag(data.requester);
  const zone = getIanaZone(input.timeZone);
  const org = text(requester.org);
  const isHealthCare = text(intake.program) === "WA Apple Health";
  const notes = text(data.privateNotes);

  const saved = savedSection5(notes);
  // The person's details as the request forms save them (staff-only fields), in the form's own row labels.
  const patient: [string, string][] = [
    ["Provider One #", text(intake.providerOneNumber)],
    ["Gender", text(intake.clientGender)],
    ["Hearing Identity", identityLabel(text(bag(data.brief).hearingIdentity))],
    ["Specific Interpreter Requested", text(intake.requestedInterpreter)],
  ];
  const section5Rows: FormRow[] = saved
    ? withPatientDetails(rowsFromLines(saved.lines), patient)
    : [
        ...(isHealthCare || text(intake.providerOneNumber) ? [row("Provider One #", intake.providerOneNumber)] : []),
        row("Gender", intake.clientGender),
        row("Hearing Identity", identityLabel(text(bag(data.brief).hearingIdentity))),
        row("Specific Interpreter Requested", intake.requestedInterpreter),
        row("Interpreter Gender", null),
        row("Comment", null),
      ];

  const link = text(details.meetingLink) || text(details.virtualLink);
  const platform = [text(details.platform), link].filter(Boolean).join(" ");
  const sections: FormSection[] = [
    {
      number: 1,
      title: "INTERPRETER AGENCY",
      tag: null,
      private: false,
      rows: [row("Service Request #", intake.odhhSrn), row("Requestor Name", requester.name), row("Requestor Phone", requester.phone), row("Requestor Email", requester.email), row("Requestor Location", null)],
    },
    {
      number: 2,
      title: "ACCOUNT INFORMATION",
      tag: null,
      private: false,
      rows: [
        row("Billing Organization Name", isRealOrganization(org) ? org : null),
        row("Contact", requester.billContact),
        row("Email", requester.billEmail),
        row("Phone", requester.billPhone),
        row("Billing Address", null),
        row("NPI #", null),
      ],
    },
    {
      number: 3,
      title: "APPOINTMENT INFORMATION",
      tag: intake.crucialAppointment === true ? "Crucial Appointment" : null,
      private: false,
      rows: [
        row("Appointment Date", clock(input.startsAt, zone, "M/d/yyyy")),
        row("Appointment Start Time", clock(input.startsAt, zone, "h:mm a")),
        row("Appointment End Time", clock(input.endsAt, zone, "h:mm a")),
        row("Appointment Setting", details.setting),
        ...(text(intake.bookingPeriod) ? [row("Booking Period", intake.bookingPeriod)] : []),
        row("Appointment Note", data.prepNotes),
      ],
    },
    {
      number: 4,
      title: "APPOINTMENT LOCATION",
      tag: null,
      private: false,
      rows: [
        row("Location", onsite.venue),
        row("Contact", onsite.contact),
        row("Contact details", onsite.contactMethod),
        row("Address", onsite.address),
        row("Building", onsite.building),
        row("Floor", onsite.floor),
        row("Room", onsite.room),
        row("Direction & Parking Note", onsite.parking),
        row("Virtual Meeting/Platform", platform),
        row("Format", details.format),
        ...(yesNo(intake.isPublic) ? [row("Public", yesNo(intake.isPublic))] : []),
        ...(yesNo(intake.isMixedGroup) ? [row("Mixed Group", yesNo(intake.isMixedGroup))] : []),
      ],
    },
    { number: 5, title: saved?.title ?? (isHealthCare ? "PATIENT INFORMATION" : "CLIENT/EMPLOYEE INFORMATION"), tag: null, private: true, rows: section5Rows },
  ];
  return { source: "records", sections, banners: intake.preAuthorizationRequired === true ? [PRE_AUTHORIZATION_BANNER] : [], sentAt: null };
}

/** The form to show for a job: its saved state email when there is one that reads as a form, otherwise the job's own details. */
export function buildStateFormView(input: StateFormInput): StateFormView {
  const raw = text(bag(bag(input.data).source).rawContent);
  if (raw && hasJobAnchor(normalizeEmailText(raw))) {
    const fromEmail = parseStateFormEmail(raw);
    if (fromEmail) return fromEmail;
  }
  return recordsView(input);
}
