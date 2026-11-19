import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDraftData } from "@/lib/odhhDraft";
import { parseIntakeEmail } from "@/lib/odhhEmailParser";
import { planEnrichment } from "@/lib/odhhEnrich";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { liftVirtualMeeting } from "@/lib/odhhMeetingLift";
import { PREP_ID_LABEL, scrubPrepIds } from "@/lib/odhhPrepScrub";
import { TEAM_CONFLICT_WARNING, TEAM_UNCLEAR_WARNING, teamRequest } from "@/lib/odhhTeam";
import { positionCount } from "@/lib/positions";
import { chooseReceiptJob } from "@/lib/verificationReceipt";
import type { ReceiptJob } from "@/lib/verificationReceipt";
import { outcomeView } from "@/lib/inboxOutcome";

/** A made-up state form; `note` is its Appointment Note, `extra` any lines added under section 4. */
const form = (note: string, extra = "") =>
  [
    "Service Request #202786991",
    "3. APPOINTMENT INFORMATION",
    "Appointment Date: 11/12/2026",
    "Appointment Start Time: 9:00 AM",
    "Appointment End Time: 11:00 AM",
    `Appointment Note: ${note}`,
    "",
    "4. APPOINTMENT LOCATION",
    "Location: Virtual",
    "Virtual Meeting/Platform: Teams",
    extra,
    "5. CLIENT/EMPLOYEE INFORMATION",
    "Gender: Female",
    "Provider One #123456789WA",
  ].join("\n");

const draft = (raw: string) => {
  const parsed = parseIntakeEmail(raw, "");
  const warnings: string[] = [];
  const data = buildDraftData({ parsed, extras: parseFormExtras(raw), srn: parsed.srn, fromEmail: "odhh@dshs.wa.gov", subject: "", rawContent: raw, contentHash: "h", receivedAt: "2026-11-04T00:00:00.000Z", warnings, startsAt: new Date("2026-11-12T17:00:00Z"), endsAt: new Date("2026-11-12T19:00:00Z") });
  return { data: data as unknown as Record<string, unknown>, warnings };
};
const field = (data: Record<string, unknown>, section: string, key: string): unknown => (data[section] as Record<string, unknown> | undefined)?.[key];

describe("team size from the form's words", () => {
  it("reads a stated number, a 'team of', and leaves a single interpreter alone", () => {
    assert.deepEqual(teamRequest("Please send 2 interpreters."), { count: 2, warning: null });
    assert.deepEqual(teamRequest("A team of three is needed"), { count: 3, warning: null });
    assert.deepEqual(teamRequest("Specific Interpreter Requested: none", "One interpreter is fine"), { count: null, warning: null });
  });

  it("opens two positions for an unnumbered team, and flags it; two different numbers are flagged and set nothing", () => {
    assert.deepEqual(teamRequest("The interpreter team will switch every 20 minutes"), { count: 2, warning: TEAM_UNCLEAR_WARNING });
    assert.deepEqual(teamRequest("2 interpreters", "3 interpreters"), { count: null, warning: TEAM_CONFLICT_WARNING });
  });

  it("gives a new draft that many positions", () => {
    const { data, warnings } = draft(form("Two ASL interpreters needed"));
    assert.equal(positionCount(data), 2);
    assert.deepEqual(warnings.filter((w) => w.startsWith("Team")), []);
    assert.equal(positionCount(draft(form("Bring the agenda")).data), 1);
  });
});

describe("8-digit numbers in the preparation notes", () => {
  it("moves a bare 8-digit number and keeps join details, longer numbers, links and dates", () => {
    const s = scrubPrepIds("Case 12345678 today. Meeting ID: 87654321. Call 3605550100. https://x.test/a/11223344 on 11/12/2026, code 1234-5678");
    assert.deepEqual(s.moved, ["12345678"]);
    assert.ok(s.text.includes("87654321") && s.text.includes("3605550100") && s.text.includes("11223344") && s.text.includes("1234-5678"));
    assert.ok(!s.text.includes("12345678"));
  });

  it("puts the moved number in the agency-private notes, never the interpreter's", () => {
    const { data } = draft(form("Bring ID 12345678 to the front desk"));
    assert.ok(!String(data.prepNotes).includes("12345678"));
    assert.ok(String(data.privateNotes).includes(`${PREP_ID_LABEL} 12345678`));
  });
});

describe("join links of virtual jobs", () => {
  const teams = "https://teams.microsoft.com/l/meetup-join/abc";
  it("finds the link in the Appointment Note, then on a line of its own", () => {
    assert.equal(liftVirtualMeeting({ parking: null, appointmentNote: `Join here: ${teams} Meeting ID: 123 456 789`, rawContent: "" })?.lifted.meetingLink, teams);
    assert.equal(liftVirtualMeeting({ parking: null, appointmentNote: null, rawContent: `Join:\n${teams}\n` })?.from, "line");
  });

  it("never takes another kind of link from the note", () => {
    assert.equal(liftVirtualMeeting({ parking: null, appointmentNote: "Map: https://maps.example.com/x", rawContent: "" }), null);
  });

  it("stores it on the draft as the meeting link", () => {
    const { data } = draft(form(`Join ${teams}`));
    assert.equal(field(data, "details", "meetingLink"), teams);
  });
});

describe("the WA # fills an existing job's blank", () => {
  it("adds intake.providerOneNumber and never replaces one already there", () => {
    const formView = draft(form("x")).data;
    const plan = planEnrichment({ status: "booked", data: { intake: { odhhSrn: "202786991" } }, startsAt: new Date("2026-11-12T17:00:00Z") }, formView);
    assert.ok(plan.changed.includes("intake.providerOneNumber"));
    assert.equal(field(plan.data, "intake", "providerOneNumber"), "123456789WA");
    const kept = planEnrichment({ status: "booked", data: { intake: { providerOneNumber: "999999999WA" } }, startsAt: new Date() }, formView);
    assert.ok(!kept.changed.includes("intake.providerOneNumber"));
  });
});

const AT = new Date("2026-11-12T17:00:00Z");
const job = (id: string, cancelled: boolean): ReceiptJob => ({ id, createdAt: AT, data: { brief: {}, intake: {} } as ReceiptJob["data"], isStateJob: true, canceledAt: cancelled ? AT : null });

describe("which job a service verification belongs to", () => {
  it("prefers the one open job, and calls two open jobs ambiguous", () => {
    assert.deepEqual(chooseReceiptJob([job("a", true), job("b", false)], true), { kind: "open", job: job("b", false) });
    assert.equal(chooseReceiptJob([job("a", false), job("b", false)], false).kind, "ambiguous");
  });

  it("keeps the state's cancellation receipt on the cancelled job, but never a report of worked hours", () => {
    assert.equal(chooseReceiptJob([job("a", true)], true).kind, "cancelled");
    assert.equal(chooseReceiptJob([job("a", true)], false).kind, "none");
    assert.equal(chooseReceiptJob([], true).kind, "none");
  });
});

describe("Inbox outcome chips", () => {
  it("names the new outcomes", () => {
    assert.equal(outcomeView("hours_report")?.tone, "quiet");
    assert.equal(outcomeView("hours_no_job")?.tone, "attention");
    assert.equal(outcomeView("notice_only")?.label, "State notice: no action");
    assert.equal(outcomeView("returned")?.tone, "done");
  });
});
