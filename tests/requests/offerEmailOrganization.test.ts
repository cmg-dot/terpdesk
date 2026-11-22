import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailOrganization, sanitizeOrganization } from "@/lib/emailOrganization";
import { escapeHtml } from "@/lib/emailTemplate";
import { GENERIC_SETTINGS, genericSetting } from "@/lib/genericSetting";
import { buildOfferEmail, offerRows } from "@/lib/jobEmails";
import { summarizeJob } from "@/lib/jobSummary";

const ADDRESS = "4800 Sand Point Way NE, Seattle, WA 98105";
const request = (data: Record<string, unknown>) => ({
  id: "5a8c56a4-0000-4000-8000-000000000001",
  title: "ODHH SRN #202787460",
  createdAt: new Date("2026-11-24T17:00:00Z"),
  data: {
    intake: { program: "WA ODHH", odhhSrn: "202787460", providerOneNumber: "123456789WA" },
    details: { format: "In person", setting: "Medical Provider-Medicaid", deafParticipant: "Test Client Person", timeZone: "America/Los_Angeles" },
    onsite: { venue: "OTOLARYNGOLOGY CLINIC", room: "Ocean 8", address: ADDRESS },
    schedule: { startsAt: "2026-11-24T17:00:00.000Z", endsAt: "2026-11-24T19:00:00.000Z" },
    ...data,
  },
});
const offerEmail = (data: Record<string, unknown>, organization?: string | null) =>
  buildOfferEmail(summarizeJob(request(data)), "https://x.test/accept", "https://x.test/decline", "Mon, Nov 23, 2026 at 5:00 PM PST", organization);
/** The labels of the details table in the plain-text email: the block right after the opening line (before the location note). */
const rowLabels = (text: string) => text.split("\n\n")[1].split("\n").map((l) => l.split(":")[0]);

describe("the generic setting in emails", () => {
  it("maps the form's free text to a fixed category", () => {
    const table: [string, string][] = [
      ["Medical Provider-Medicaid", "Medical"],
      ["MEDICAID COVERED SERVICE", "Medical"],
      ["Mental Health Provider-Medicaid", "Mental Health"],
      ["Behavioral health counseling", "Mental Health"],
      ["Legal", "Legal"],
      ["Court hearing", "Legal"],
      ["Education", "Educational"],
      ["School meeting", "Educational"],
      ["Job Interview", "Employment"],
      ["Workplace", "Employment"],
      ["Community", "Social Services"],
      ["DSHS benefits office", "Social Services"],
      ["Client Services - Direct", "Social Services"],
      ["CARE Assessment - In Home", "Social Services"],
      ["Business", "Employment"],
      ["VISION", "Medical"],
      ["Other", "General"],
      ["ODHH: DIRECTOR'S MEETING", "General"],
      ["Staff Meeting - 1 Deaf", "General"],
      ["Conference", "General"],
      ["", "General"],
    ];
    for (const [raw, expected] of table) assert.equal(genericSetting(raw), expected, raw);
    assert.equal(genericSetting(undefined), "General");
    assert.equal(genericSetting(42), "General");
  });

  it("only ever gives one of the fixed categories, never the form's words", () => {
    for (const raw of ["Dr. Test Client's knee surgery at 123 Main St", "Chemotherapy for patient 12345", "anything at all"]) {
      assert.ok((GENERIC_SETTINGS as readonly string[]).includes(genericSetting(raw)), raw);
    }
    assert.equal(summarizeJob(request({})).setting, "Medical");
    assert.equal(summarizeJob(request({ details: {} })).setting, "General");
  });
});

describe("the organization an offer email may carry", () => {
  it("accepts a clean organization name", () => {
    for (const name of ["Seattle Children's Hospital", "DVR", "WASILC", "DCYF", "University of Washington - DECOD", "DVR Access for Participants", "Kaiser Permanente"]) {
      assert.equal(sanitizeOrganization(name), name, name);
    }
  });

  it("blocks a person's name, an email, a phone, an ID number, a link and a program placeholder", () => {
    for (const bad of ["Renee Takeuchi", "Sam Sample", "decod@uw.edu", "206-555-0100", "(206) 555 0100", "Children's Center 12345", "https://example.org", "WA ODHH", "organization not provided", "", "   "]) {
      assert.equal(sanitizeOrganization(bad), null, bad);
    }
    assert.equal(sanitizeOrganization(null), null);
    assert.equal(sanitizeOrganization(42), null);
    assert.equal(sanitizeOrganization("Hospital ".repeat(20)), null);
  });

  it("takes the billing organization, else the requester's, skipping a contact's name", () => {
    assert.equal(emailOrganization({ requester: { billOrg: "DVR", org: "Other Org Hospital" } }), "DVR");
    // An older job: the billing field holds a person's name, so the organization is used instead.
    assert.equal(emailOrganization({ requester: { billOrg: "Renee Takeuchi", org: "University of Washington - DECOD" } }), "University of Washington - DECOD");
    assert.equal(emailOrganization({ requester: { billOrg: "", org: "WA ODHH" } }), null);
    assert.equal(emailOrganization({}), null);
    assert.equal(emailOrganization(null), null);
  });
});

describe("the offer email's details table", () => {
  it("lists the usual rows, with Organization after Assignment when the job names one", () => {
    const email = offerEmail({}, "Seattle Children's Hospital");
    assert.deepEqual(rowLabels(email.text), ["Assignment", "Organization", "Date", "Time", "Format", "Setting", "Role", "Program"]);
    assert.ok(email.text.includes("Organization: Seattle Children's Hospital"));
    assert.ok(email.html.includes("Organization") && email.html.includes(escapeHtml("Seattle Children's Hospital")));
    assert.ok(email.text.includes("Setting: Medical"), "the setting is the generic category");
  });

  it("has no Organization row when there is none, or when the value is not a clean organization name", () => {
    assert.deepEqual(rowLabels(offerEmail({}).text), ["Assignment", "Date", "Time", "Format", "Setting", "Role", "Program"]);
    for (const unsafe of ["Renee Takeuchi", "decod@uw.edu", "WA ODHH", "206-555-0100"]) {
      const email = offerEmail({}, unsafe);
      assert.ok(!email.text.includes("Organization:") && !email.html.includes("Organization"), unsafe);
      // "WA ODHH" is the Program row's own label, so only the other values can be checked for absence.
      if (unsafe !== "WA ODHH") assert.ok(!email.html.includes(unsafe) && !email.text.includes(unsafe), unsafe);
    }
    assert.equal(offerRows(summarizeJob(request({})), "Renee Takeuchi").length, 7);
  });

  it("still keeps the place, SRN and client out of the email, and the form's setting words too", () => {
    const email = offerEmail({}, "Seattle Children's Hospital");
    const all = `${email.subject}${email.html}${email.text}`;
    for (const never of [ADDRESS, "OTOLARYNGOLOGY", "Ocean 8", "202787460", "Test Client Person", "123456789WA", "Medicaid"]) assert.ok(!all.includes(never), never);
    assert.ok(all.includes("Click below to review the full location and address before accepting."));
  });
});
