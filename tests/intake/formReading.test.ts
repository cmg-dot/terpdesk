import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmailText, unflattenStateForm } from "@/lib/odhhEmailText";
import { parseIntakeEmail as parseFromParser } from "@/lib/odhhEmailParser";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { formGate, hasStandardSections, isHcaForm, isWaGovSender } from "@/lib/odhhFormGate";
import { providerOneFromStateText } from "@/lib/providerOne";

/** A state form whose line breaks were lost on the way (all names, numbers and addresses made up). */
const FLAT =
  "-------- Original message --------From: odhh@dshs.wa.gov Date: 11/4/26 9:15 AM (GMT-08:00) To: agency@example.com Subject: Interpreter Request - 11/12/2026 - #202786989 " +
  "1. INTERPRETER AGENCY Date of Interpreter Request - 11/04/2026Service Request #202786989Requestor Name: Pat TestRequestor Phone: 3605550100Requestor Email: pat.test@dshs.wa.govRequestor Location: Olympia" +
  "2. ACCOUNT INFORMATION Billing Organization Name: Test DivisionContact: Sam SampleEmail: sam.sample@dshs.wa.govPhone: 3605550101" +
  "3. APPOINTMENT INFORMATIONAppointment Date: 11/12/2026Appointment Start Time: 9:00 AMAppointment End Time: 11:00 AMBooking Period: 72 HoursAppointment Setting: Staff meetingAppointment Note: Bring the agenda" +
  "4. APPOINTMENT LOCATIONLocation: Test BuildingAddress: 1115 Washington St SE, Olympia, WA 98504Room: 2Floor: 3Contact: Lee SampleDirection & Parking Note: Visitor lot" +
  "5. CLIENT/EMPLOYEE INFORMATIONGender: FemaleHearing Identity: DeafSpecific Interpreter Requested: Interpreter Gender: Comment: ======================== CONTRACTOR ONLY ====";

const NORMAL = [
  "1. INTERPRETER AGENCY",
  "Service Request #202786990",
  "Requestor Name: Pat Test",
  "Requestor Email: pat.test@dshs.wa.gov",
  "3. APPOINTMENT INFORMATION",
  "Appointment Date: 11/12/2026",
  "Appointment Start Time: 9:00 AM",
  "Appointment End Time: 11:00 AM",
  "4. APPOINTMENT LOCATION",
  "Location: Office of Testing",
  "Address: 1115 Washington St SE, Olympia, WA 98504",
].join("\n");

describe("a state form whose line breaks were lost", () => {
  it("reads the date, the times, the requester and the place again", () => {
    const p = parseFromParser(FLAT, "Interpreter Request - 11/12/2026 - #202786989");
    assert.equal(p.srn, "202786989");
    assert.equal(p.isoDate, "2026-11-12");
    assert.equal(p.start24, "09:00");
    assert.equal(p.end24, "11:00");
    assert.equal(p.requestorEmail, "pat.test@dshs.wa.gov");
    assert.equal(p.requestorPhone, "3605550100");
    assert.equal(p.venue, "Test Building");
    assert.equal(p.address, "1115 Washington St SE, Olympia, WA 98504");
    assert.equal(p.appointmentNote, "Bring the agenda");
  });

  it("reads the form's extras, and an empty field stays empty instead of swallowing the next label", () => {
    const x = parseFormExtras(FLAT);
    assert.equal(x.billingOrganization, "Test Division");
    assert.equal(x.room, "2");
    assert.equal(x.floor, "3");
    assert.equal(x.parking, "Visitor lot");
    assert.equal(x.requestedInterpreter, null);
  });

  it("never takes 'Public - No' for the platform, or the meeting label for the room", () => {
    const flat = FLAT.replace("Room: 2Floor: 3", "Room: Virtual Meeting/Platform: Public - NoMixed Group - No");
    const p = parseFromParser(flat, "");
    const x = parseFormExtras(flat);
    assert.equal(p.platform, null);
    assert.equal(p.format, "in_person");
    assert.equal(x.room, null);
    assert.equal(x.isPublic, false);
    assert.equal(x.isMixedGroup, false);
  });

  it("leaves a normal form exactly as it was", () => {
    assert.equal(unflattenStateForm(NORMAL), NORMAL);
    assert.equal(normalizeEmailText(NORMAL), NORMAL);
    assert.equal(parseFromParser(NORMAL, "").venue, "Office of Testing");
  });

  it("reads a date or time written on the line below its label", () => {
    const p = parseFromParser(NORMAL.replace("Appointment Date: 11/12/2026", "Appointment Date:\n11/12/2026").replace("Appointment Start Time: 9:00 AM", "Appointment Start Time:\n9:00 AM"), "");
    assert.equal(p.isoDate, "2026-11-12");
    assert.equal(p.start24, "09:00");
  });
});

describe("the Inbox gate for forms without the portal link", () => {
  const flat = normalizeEmailText(FLAT);
  const gate = (over: { raw?: string; sender?: string; trusted?: boolean }) =>
    formGate({ rawContent: over.raw ?? FLAT, srn: "202786989", senderEmail: over.sender ?? "someone@example.com", senderTrusted: async () => over.trusted ?? false });

  it("sees the numbered sections and the HCA markers", () => {
    assert.ok(hasStandardSections(flat));
    assert.equal(isHcaForm(flat), false);
    assert.ok(isHcaForm(NORMAL.replace("4. APPOINTMENT LOCATION", "4. APPOINTMENT LOCATION\n5. PATIENT INFORMATION")));
    assert.ok(isWaGovSender("x@hca.wa.gov") && !isWaGovSender("x@wa.gov.example.com"));
  });

  it("accepts a trusted sender's forward, and refuses the same text from anyone else", async () => {
    assert.equal(await gate({ trusted: true }), "trusted_forward");
    assert.equal(await gate({}), null);
  });

  it("accepts an HCA form from a Washington government address", async () => {
    const hca = `${NORMAL}\n5. PATIENT INFORMATION\nHCA Reference Number: 123`;
    assert.equal(await gate({ raw: hca, sender: "requests@hca.wa.gov" }), "hca_form");
    assert.equal(await gate({ raw: hca, sender: "someone@example.com" }), null);
  });

  it("still takes the portal link first, and refuses text with no SRN or no form sections", async () => {
    const linked = `${NORMAL}\nhttps://fortress.wa.gov/dshs/odhhapps/x/servicerequest.aspx?id=202786989`;
    assert.equal(await gate({ raw: linked }), "portal_link");
    assert.equal(await gate({ raw: "Please book 2 interpreters", trusted: true }), null);
    assert.equal(await formGate({ rawContent: FLAT, srn: null, senderEmail: "a@dshs.wa.gov", senderTrusted: async () => true }), null);
  });
});

describe("WA # (ProviderOne) without its label", () => {
  it("reads one 9-digits-plus-WA number, and refuses a date, two different numbers, or a mention with no number", () => {
    assert.equal(providerOneFromStateText("Comment: ID is 123456789WA"), "123456789WA");
    assert.equal(providerOneFromStateText("Provider One # 123456789wa"), "123456789WA");
    assert.equal(providerOneFromStateText("Provider One # 4/12/1980"), null);
    assert.equal(providerOneFromStateText("123456789WA and 987654321WA"), null);
    assert.equal(providerOneFromStateText("onboarding and the ProviderOne portal"), null);
    assert.equal(providerOneFromStateText("ref 1234567890WA"), null);
  });
});
