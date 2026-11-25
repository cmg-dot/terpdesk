import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planNoteBackfill } from "@/lib/appointmentNoteBackfill";
import { outcomeView } from "@/lib/inboxOutcome";
import { buildDraftData } from "@/lib/odhhDraft";
import { parseIntakeEmail } from "@/lib/odhhEmailParser";
import { planEnrichment } from "@/lib/odhhEnrich";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { scrubOfferNotes } from "@/lib/offerNotes";
import { buildStateFormView } from "@/lib/stateFormView";

const NOTE = "VRC meeting virtually with an unknown customer.";

/** The state's request email for #202787804 as it arrived (made-up people), with the section-5 Comment line a test can change. */
const dshs = (comment: string | null): string =>
  [
    "1. INTERPRETER AGENCY",
    "Interpreter Agency: ASL Professionals",
    "Date of Interpreter Request - 11/23/2026",
    "Service Request #202787804",
    "Requestor Name: Jackie King",
    "Requestor Phone: 5642503635",
    "Requestor Email: DVR.aslaccess@dshs.wa.gov",
    "Requestor Location:",
    "2. ACCOUNT INFORMATION",
    "Billing Organization Name: - DVR - DVR Access for Employees",
    "Phone: 3605061780",
    "NPI #",
    "3. APPOINTMENT INFORMATION",
    "Appointment Date: 12/15/2026",
    "Appointment Start Time: 10:00 AM",
    "Appointment End Time: 11:00 AM",
    "Appointment Setting: REHABILITATION/VOCATIONAL CLIENT MEETING",
    "Setting:",
    `Appointment Note: ${NOTE}`,
    "4. APPOINTMENT LOCATION",
    "Location: Virtual Meeting",
    "Address: Virtual Meeting Tumwater, Washington 98501",
    "Virtual Meeting/Platform: Link in request email",
    "Public - No",
    "Mixed Group - No",
    "Direction & Parking Note:",
    "5. CLIENT/EMPLOYEE INFORMATION",
    "Gender:",
    "Hearing Identity:",
    "Specific Interpreter Requested:",
    "Interpreter Gender:",
    ...(comment === null ? [] : ["", `Comment: ${comment}`]),
  ].join("\n");

const draft = (raw: string): Record<string, unknown> => {
  const parsed = parseIntakeEmail(raw, "Interpreter Request - 12/15/2026 - #202787804");
  return buildDraftData({ parsed, extras: parseFormExtras(raw), srn: parsed.srn, fromEmail: "x@example.invalid", subject: "s", rawContent: raw, contentHash: "h", receivedAt: "2026-11-24T00:00:00.000Z", warnings: [], startsAt: new Date("2026-12-15T18:00:00Z"), endsAt: new Date("2026-12-15T19:00:00Z") }) as unknown as Record<string, unknown>;
};

describe("Appointment Note that repeats the section-5 Comment (#202787804)", () => {
  it("keeps the note in the interpreter-visible preparation notes", () => {
    assert.equal(draft(dshs(NOTE)).prepNotes, NOTE);
  });
  it("still keeps the Comment in the agency-private block", () => {
    assert.ok(String(draft(dshs(NOTE)).privateNotes).includes(`Comment: ${NOTE}`));
  });
  it("is the same whether the Comment differs, repeats the note or is absent", () => {
    for (const comment of ["Something else entirely.", NOTE, null]) assert.equal(draft(dshs(comment)).prepNotes, NOTE);
  });
  it("shows on the form view built from the job's own records (the Appointment Note row)", () => {
    // The saved email is left out so the view comes from what the job has on file, which is what the old rule left blank.
    const { source: _email, ...data } = draft(dshs(NOTE));
    const view = buildStateFormView({ data, startsAt: "2026-12-15T18:00:00.000Z", endsAt: "2026-12-15T19:00:00.000Z", timeZone: "America/Los_Angeles" });
    const rows = view.sections.find((s) => s.number === 3)?.rows ?? [];
    assert.equal(rows.find((r) => r.label === "Appointment Note")?.value, NOTE);
  });
  it("reaches a pending offer, scrubbed of private details like any note", () => {
    assert.equal(scrubOfferNotes(String(draft(dshs(NOTE)).prepNotes), { clientName: null }).text, NOTE);
  });
});

describe("a section-5 Comment is never the Appointment Note", () => {
  it("a form with no Appointment Note line reads no note, and its Comment stays private", () => {
    const raw = dshs("Prefers short breaks.").replace(`Appointment Note: ${NOTE}\n`, "");
    const parsed = parseIntakeEmail(raw, "");
    assert.equal(parsed.appointmentNote, null);
    const data = draft(raw);
    assert.equal(data.prepNotes, undefined);
    assert.ok(String(data.privateNotes).includes("Comment: Prefers short breaks."));
  });
  it("a numbers-only Appointment Note still goes to the private notes", () => {
    const raw = dshs(NOTE).replace(NOTE, "2272820").replace(`Comment: ${NOTE}`, "Comment: 2272820");
    const data = draft(raw);
    assert.equal(data.prepNotes, undefined);
    assert.ok(String(data.privateNotes).includes("Appointment note (state form): 2272820"));
  });
  it("a multi-line Appointment Note stops at the section-5 heading", () => {
    const raw = dshs(null).replace(`Appointment Note: ${NOTE}`, `Appointment Note: ${NOTE}\nBring the form.`);
    assert.equal(parseIntakeEmail(raw, "").appointmentNote, `${NOTE}\nBring the form.`);
  });
});

describe("filling the blank note of a job that already exists (the form's view)", () => {
  it("fills a blank prepNotes and never changes one that is written", () => {
    const form = draft(dshs(NOTE));
    const blank = planEnrichment({ status: "draft", data: { prepNotes: "" }, startsAt: new Date("2026-12-15T18:00:00Z") }, form);
    assert.ok(blank.changed.includes("prepNotes"));
    const written = planEnrichment({ status: "draft", data: { prepNotes: "Staff wrote this." }, startsAt: new Date("2026-12-15T18:00:00Z") }, form);
    assert.equal(written.changed.includes("prepNotes"), false);
  });
});

describe("planNoteBackfill (the six jobs)", () => {
  const stored = (comment: string | null, prepNotes = ""): Record<string, unknown> => ({ prepNotes, source: { rawContent: dshs(comment), subject: "Interpreter Request - 12/15/2026 - #202787804" } });
  it("restores the note into a blank prepNotes and changes nothing else", () => {
    const before = stored(NOTE);
    const plan = planNoteBackfill("draft", before);
    assert.equal(plan.outcome, "restored");
    assert.deepEqual({ ...plan.data, prepNotes: "" }, { ...before, prepNotes: "" });
    assert.equal(plan.data?.prepNotes, NOTE);
  });
  it("leaves written notes alone", () => assert.equal(planNoteBackfill("booked", stored(NOTE, "Staff wrote this.")).outcome, "already_has_notes"));
  it("skips a cancelled job and a job with no saved email", () => {
    assert.equal(planNoteBackfill("Cancelled", stored(NOTE)).outcome, "closed");
    assert.equal(planNoteBackfill("draft", { prepNotes: "" }).outcome, "no_stored_email");
  });
  it("reports a form with no Appointment Note", () => {
    const raw = dshs(null).replace(`Appointment Note: ${NOTE}\n`, "");
    assert.equal(planNoteBackfill("draft", { source: { rawContent: raw, subject: "" } }).outcome, "no_note_on_form");
  });
  it("is safe to run twice", () => {
    const first = planNoteBackfill("draft", stored(NOTE));
    assert.equal(planNoteBackfill("draft", first.data ?? {}).outcome, "already_has_notes");
  });
});

describe("Inbox outcome labels for a reply's meeting link", () => {
  it("every outcome the link step saves has a label", () => {
    for (const outcome of ["link_applied", "link_held", "link_review", "link_kept"]) assert.ok(outcomeView(outcome), outcome);
    assert.equal(outcomeView("link_held")?.tone, "attention");
    assert.equal(outcomeView("link_applied")?.tone, "done");
  });
});
