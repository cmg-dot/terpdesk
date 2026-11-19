import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanAnswer, isAnswered, parseQuestionHref, questionHref, readClarifications, withAnswer } from "@/lib/clarificationThread";
import { interpreterJobView } from "@/lib/interpreterJobData";
import { jobHeadline } from "@/lib/jobHeadline";
import { buildDraftData } from "@/lib/odhhDraft";
import { parseIntakeEmail } from "@/lib/odhhEmailParser";
import { planEnrichment } from "@/lib/odhhEnrich";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { looksLikeOrganization, parentOrganization } from "@/lib/stateOrganization";

const REQ = "7e6d6250-0000-4000-8000-000000000001";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const AT = new Date("2026-11-20T18:00:00Z");
const list = [
  { id: Q1, interpreterId: "i-1", interpreterName: "Sample A", question: "Which entrance?", askedAt: "2026-11-19T10:00:00Z", beforeAccepting: true },
  { id: Q2, interpreterId: "i-2", interpreterName: "Sample B", question: "Parking?", askedAt: "2026-11-19T11:00:00Z" },
];

describe("answering an interpreter's question", () => {
  it("saves the answer on that question only and counts what is still open", () => {
    const r = withAnswer(list, Q1, "Use the north door.", "Josie", AT);
    assert.ok(r.ok);
    assert.equal(r.answered.answer, "Use the north door.");
    assert.equal(r.answered.answeredBy, "Josie");
    assert.equal(r.answered.answeredAt, AT.toISOString());
    assert.equal(r.answered.interpreterId, "i-1");
    assert.equal(r.stillOpen, 1);
    assert.equal(isAnswered(r.clarifications[1]), false);
  });

  it("refuses a second answer and an unknown question", () => {
    const once = withAnswer(list, Q1, "Yes.", "Josie", AT);
    assert.ok(once.ok);
    assert.deepEqual(withAnswer(once.clarifications, Q1, "Again", "Kari", AT), { ok: false, error: "This question was already answered." });
    assert.equal(withAnswer(list, "33333333-3333-4333-8333-333333333333", "x", "Josie", AT).ok, false);
    assert.equal(withAnswer(null, Q1, "x", "Josie", AT).ok, false);
  });

  it("links a staff notice to its question, and still reads older notices that name none", () => {
    assert.equal(questionHref(REQ, Q1), `/requests/${REQ}?question=${Q1}#questions`);
    assert.deepEqual(parseQuestionHref(questionHref(REQ, Q1)), { requestId: REQ, questionId: Q1 });
    assert.deepEqual(parseQuestionHref(`/requests/${REQ}#questions`), { requestId: REQ, questionId: null });
    assert.equal(parseQuestionHref("/staffing"), null);
    assert.equal(parseQuestionHref(`/requests/${REQ}?question=../x#questions`), null);
  });

  it("lists questions newest first, skips malformed entries, and cleans the answer", () => {
    assert.deepEqual(readClarifications([...list, { id: 3 }]).map((c) => c.id), [Q2, Q1]);
    assert.equal(cleanAnswer("  Use door B\u0007\n  "), "Use door B");
  });
});

describe("the job header", () => {
  it("reads 'ODHH <SRN> - <parent organization>' on a state job", () => {
    assert.equal(jobHeadline({ srn: "202787460", organization: "Seattle Children's Hospital", venue: "OTOLARYNGOLOGY CLINIC" }), "ODHH 202787460 - Seattle Children's Hospital");
    assert.equal(jobHeadline({ srn: "202786902", organization: "University of Washington - DECOD", venue: "Seattle" }), "ODHH 202786902 - University of Washington - DECOD");
  });

  it("falls back to the place's name, never a program placeholder or a street address", () => {
    assert.equal(jobHeadline({ srn: "202787460", organization: "WA ODHH", venue: "OTOLARYNGOLOGY CLINIC" }), "ODHH 202787460 - OTOLARYNGOLOGY CLINIC");
    assert.equal(jobHeadline({ srn: "202787460", organization: "WA ODHH", venue: "4800 Sand Point Way NE" }), "ODHH 202787460");
    assert.equal(jobHeadline({ srn: "202787460", organization: null, venue: "Virtual" }), "ODHH 202787460");
  });

  it("leaves a private job as it was: its organization, else its title", () => {
    assert.equal(jobHeadline({ organization: "DVR", title: "Team meeting" }), "DVR");
    assert.equal(jobHeadline({ organization: null, title: "Team meeting" }), "Team meeting");
  });
});

/** A made-up state form: blank Billing Organization Name, the hospital named as the Requestor Location. */
const form = (requestorLocation: string, note = "Check in at the front desk") =>
  [
    "1. INTERPRETER AGENCY",
    "Service Request #202787460",
    `Requestor Location: ${requestorLocation}`,
    "2. ACCOUNT INFORMATION",
    "Billing Organization Name:",
    "Contact: Sam Sample",
    "3. APPOINTMENT INFORMATION",
    "Appointment Date: 11/24/2026",
    "Appointment Start Time: 9:00 AM",
    "Appointment End Time: 10:00 AM",
    `Appointment Note: ${note}`,
    "",
    "4. APPOINTMENT LOCATION",
    "Location: OTOLARYNGOLOGY CLINIC - OCEAN 8",
    "Address: 4800 Sand Point Way NE, Seattle, WA 98105",
  ].join("\n");
const draftOf = (raw: string) => {
  const parsed = parseIntakeEmail(raw, "");
  return buildDraftData({ parsed, extras: parseFormExtras(raw), srn: parsed.srn, fromEmail: "odhh@dshs.wa.gov", subject: "", rawContent: raw, contentHash: "h", receivedAt: "2026-11-13T00:00:00Z", warnings: [], startsAt: new Date("2026-11-24T17:00:00Z"), endsAt: new Date("2026-11-24T18:00:00Z") }) as unknown as Record<string, Record<string, unknown>>;
};

describe("the parent organization of a state form", () => {
  it("takes an organization named as the Requestor Location when the billing organization is blank", () => {
    assert.equal(parseFormExtras(form("Seattle Children's Hospital")).requestorLocation, "Seattle Children's Hospital");
    const d = draftOf(form("Seattle Children's Hospital"));
    assert.equal(d.requester.org, "Seattle Children's Hospital");
    assert.equal(d.requester.billOrg, undefined);
    assert.equal(d.onsite.venue, "OTOLARYNGOLOGY CLINIC");
    assert.equal(d.onsite.room, "Ocean 8");
  });

  it("never takes a city, and the billing organization wins when it is given", () => {
    assert.equal(draftOf(form("Olympia")).requester.org, "WA ODHH");
    assert.equal(looksLikeOrganization("Tacoma, WA"), false);
    assert.equal(parentOrganization({ billingOrganization: "DVR", requestorLocation: "Seattle Children's Hospital" }), "DVR");
  });
});

describe("202786902: the form's note and organization reach the interpreter", () => {
  // The job as it was: venue a city, organization set, preparation notes blank (the note went only to the private notes).
  const job = {
    intake: { odhhSrn: "202786902", program: "WA ODHH" },
    requester: { org: "University of Washington - DECOD", oneTime: true },
    onsite: { venue: "Seattle", room: "B323" },
    details: { format: "In person" },
    privateNotes: "Appointment note (state form): Check in at the front desk",
  };

  it("fills the blank preparation notes from the state's form, and never rewrites notes already written", () => {
    const formView = draftOf(form("Seattle"));
    const plan = planEnrichment({ status: "Offer awaiting response", data: job, startsAt: new Date("2026-11-24T17:00:00Z") }, formView);
    assert.ok(plan.changed.includes("prepNotes"));
    assert.equal(plan.data.prepNotes, "Check in at the front desk");
    const kept = planEnrichment({ status: "booked", data: { ...job, prepNotes: "Staff wrote this" }, startsAt: new Date() }, formView);
    assert.equal(kept.data.prepNotes, "Staff wrote this");
    assert.ok(!kept.changed.includes("prepNotes"));
  });

  it("keeps a numbers-only note out of the preparation notes", () => {
    const plan = planEnrichment({ status: "draft", data: { ...job, privateNotes: "" }, startsAt: new Date() }, draftOf(form("Seattle", "2272820")));
    assert.ok(!plan.changed.includes("prepNotes"));
  });

  it("shows the organization to the interpreter, but never a program placeholder", () => {
    const view = interpreterJobView({ ...job, prepNotes: "Check in at the front desk" }, "offer");
    assert.equal(view.organization, "University of Washington - DECOD");
    assert.equal(view.offerNotes, "Check in at the front desk");
    assert.equal(interpreterJobView({ ...job, requester: { org: "WA ODHH" } }, "booked").organization, null);
  });
});
