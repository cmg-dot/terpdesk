import type { ActivityChange } from "@/db/schema";
import { jobDetailsFor } from "@/lib/jobSummary";
import type { JobDetails, JobRequestRow } from "@/lib/jobSummary";

/**
 * What an edit changed, in interpreter-facing terms ("Time changed from X to Y").
 *
 * `emailSafe` changes (date, time, format, generic setting, program, assignment title, positions) may be quoted in an
 * email. Every other change (location, meeting access, contact, notes) is named in the email but its values are shown
 * only on the secure job-details page and in the app (security.md: no PHI in outbound email).
 *
 * SERVER ONLY (pure, but only the edit actions use it).
 */

export interface JobFieldChange extends ActivityChange {
  emailSafe: boolean;
}

type LooseData = Record<string, unknown>;

const obj = (v: unknown): LooseData => (v && typeof v === "object" && !Array.isArray(v) ? (v as LooseData) : {});
const show = (v: string): string => (v.trim() ? v.trim() : "(none)");

const positionsLabel = (request: JobRequestRow): string => {
  const data = obj(request.data);
  const details = obj(data.details);
  const team =
    data.slotCount === 2 || details.slotCount === 2 || data.requiredPositions === 2 || data.positions === "Team — two independent positions";
  return team ? "Team (two interpreters)" : "One interpreter";
};

type Field = { label: string; emailSafe: boolean; read: (d: JobDetails, r: JobRequestRow) => string };

const FIELDS: Field[] = [
  { label: "Assignment", emailSafe: true, read: (d) => d.title },
  { label: "Date", emailSafe: true, read: (d) => d.dateLabel },
  { label: "Time", emailSafe: true, read: (d) => d.timeLabel },
  { label: "Format", emailSafe: true, read: (d) => d.format },
  { label: "Setting", emailSafe: true, read: (d) => d.setting },
  { label: "Program", emailSafe: true, read: (d) => d.program },
  { label: "Positions", emailSafe: true, read: (_d, r) => positionsLabel(r) },
  { label: "Venue", emailSafe: false, read: (d) => d.location?.venue ?? "" },
  { label: "Address", emailSafe: false, read: (d) => d.location?.address ?? "" },
  { label: "Building / room", emailSafe: false, read: (d) => d.location?.building ?? "" },
  { label: "Entrance", emailSafe: false, read: (d) => d.location?.entrance ?? "" },
  { label: "Parking", emailSafe: false, read: (d) => d.location?.parking ?? "" },
  {
    label: "On-site contact",
    emailSafe: false,
    read: (d) => [d.location?.contact, d.location?.contactMethod].filter(Boolean).join(" · "),
  },
  { label: "Meeting platform", emailSafe: false, read: (d) => d.virtual?.platform ?? "" },
  { label: "Meeting link", emailSafe: false, read: (d) => d.virtual?.meetingLink ?? "" },
  { label: "Meeting ID", emailSafe: false, read: (d) => d.virtual?.meetingId ?? "" },
  { label: "Passcode", emailSafe: false, read: (d) => d.virtual?.passcode ?? "" },
  { label: "Meeting instructions", emailSafe: false, read: (d) => d.virtual?.instructions ?? "" },
  { label: "Preparation notes", emailSafe: false, read: (d) => d.prepNotes },
];

/** Interpreter-facing changes between two versions of a request. Empty when nothing they see changed. */
export function diffJobForInterpreter(before: JobRequestRow, after: JobRequestRow): JobFieldChange[] {
  const a = jobDetailsFor(before);
  const b = jobDetailsFor(after);
  const changes: JobFieldChange[] = [];
  for (const f of FIELDS) {
    const from = f.read(a, before).trim();
    const to = f.read(b, after).trim();
    if (from !== to) changes.push({ field: f.label, from: show(from), to: show(to), emailSafe: f.emailSafe });
  }
  return changes;
}

/** Staff-only sections (requester, billing, client, private notes, program reference numbers): names only, never values. */
const AGENCY_ONLY: { label: string; read: (data: LooseData) => unknown }[] = [
  { label: "Requester", read: (d) => { const r = obj(d.requester); return [r.name, r.org, r.email, r.phone, r.prefContact]; } },
  { label: "Billing", read: (d) => { const r = obj(d.requester); return [r.billOrg, r.billContact, r.billEmail, r.poNumber]; } },
  { label: "Client", read: (d) => d.client },
  { label: "Agency-private notes", read: (d) => d.privateNotes },
  { label: "Program reference numbers", read: (d) => { const i = obj(d.intake); return [i.odhhSrn, i.odhhAccessCode, i.providerOneNumber]; } },
  { label: "Participant details", read: (d) => { const x = obj(d.details); return [x.deafParticipant, x.peopleNeeding, x.commPreferences, x.purpose, x.qualifications]; } },
];

export function agencyOnlyChangedSections(before: JobRequestRow, after: JobRequestRow): string[] {
  const a = obj(before.data);
  const b = obj(after.data);
  // Blank, missing and null all compare equal, so re-saving an untouched form logs nothing.
  const norm = (v: unknown): string => (Array.isArray(v) ? v.map(norm).join("|") : String(v ?? "").trim());
  return AGENCY_ONLY.filter((s) => norm(s.read(a)) !== norm(s.read(b))).map((s) => s.label);
}

/** "Time changed from X to Y" */
export const describeChange = (c: ActivityChange): string => `${c.field} changed from ${c.from} to ${c.to}`;
