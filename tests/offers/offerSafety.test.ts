import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpreterJobView } from "@/lib/interpreterJobData";
import { isMentalHealthJob } from "@/lib/mentalHealth";
import { REMOVED, sanitizeOfferNotes } from "@/lib/offerNotes";

/** Every person and number here is made up. */
const SECRETS = { clientName: "Maria Lopez", clientDob: "1991-05-09", providerOne: "102195953WA", priorAuth: "101578781" };

describe("sanitizeOfferNotes", () => {
  it("removes the client's name in full and in part, any case", () => {
    const out = sanitizeOfferNotes("Interpreting for Maria Lopez. maria prefers the left side; Ms. LOPEZ uses a cane.", SECRETS);
    assert.ok(!/maria|lopez/i.test(out), out);
    assert.match(out, /prefers the left side/);
  });

  it("removes the client's date of birth however it is written, and any labelled DOB", () => {
    for (const dob of ["05/09/1991", "5/9/1991", "5/9/91", "1991-05-09", "05-09-1991"]) {
      const out = sanitizeOfferNotes(`Client born ${dob}, bring ID.`, SECRETS);
      assert.ok(!out.includes(dob), `${dob} -> ${out}`);
    }
    assert.ok(!sanitizeOfferNotes("DOB: 3/4/1985", {}).includes("1985"));
  });

  it("removes the WA # / ProviderOne number, the PA #, phone numbers, emails and 7+ digit numbers", () => {
    const notes = "WA 102195953WA, PA 101578781, other id 998877665wa, call (253) 555-0142 or 253.555.0199, mail front@clinic.example.org, case 2272820.";
    const out = sanitizeOfferNotes(notes, SECRETS);
    for (const leak of ["102195953", "101578781", "998877665", "555-0142", "555.0199", "@clinic", "2272820"]) assert.ok(!out.includes(leak), `${leak} in ${out}`);
    assert.ok(out.includes(REMOVED));
  });

  it("keeps ordinary guidance, times and short numbers", () => {
    const notes = "Check in at Suite 300 by 9:45 AM. Parking in lot B, 2 hours max. Room 12.";
    assert.equal(sanitizeOfferNotes(notes, SECRETS), notes);
  });

  it("does not remove a word that only contains part of a name", () => {
    assert.equal(sanitizeOfferNotes("Mariachi band rehearsal.", { clientName: "Maria Lopez" }), "Mariachi band rehearsal.");
  });

  it("returns nothing when only removed details are left", () => {
    assert.equal(sanitizeOfferNotes("Maria Lopez 2272820", SECRETS), "");
    assert.equal(sanitizeOfferNotes("   ", SECRETS), "");
    assert.equal(sanitizeOfferNotes(null, SECRETS), "");
  });
});

describe("isMentalHealthJob", () => {
  it("is true for the U3 U9 billing modifier", () => {
    assert.equal(isMentalHealthJob({ intake: { billingModifier: "U3 U9" } }), true);
    assert.equal(isMentalHealthJob({ intake: { billingModifier: "u3  u9" } }), true);
    assert.equal(isMentalHealthJob({ intake: { billingModifier: "U3" } }), false);
  });

  it("is true for a mental or behavioral health setting, any case", () => {
    for (const setting of ["Mental Health", "mental health counseling", "Behavioral Health", "BEHAVIOURAL HEALTH"]) {
      assert.equal(isMentalHealthJob({ details: { setting } }), true, setting);
    }
    assert.equal(isMentalHealthJob({ setting: "Mental Health" }), true);
    assert.equal(isMentalHealthJob({ details: { setting: "Medical" } }), false);
    assert.equal(isMentalHealthJob({}), false);
  });
});

describe("pending-offer allowlist (interpreterJobView)", () => {
  const data = {
    intake: {
      program: "WA ODHH",
      odhhSrn: "202786075",
      providerOneNumber: SECRETS.providerOne,
      clientDob: SECRETS.clientDob,
      priorAuthNumber: SECRETS.priorAuth,
      billingModifier: "U3 U9",
      requestedInterpreter: "Someone Specific",
    },
    details: { deafParticipant: SECRETS.clientName, setting: "Medical", format: "In person", timeZone: "America/Los_Angeles", startDate: "2026-12-01", startTime: "09:00", endTime: "11:00" },
    onsite: { venue: "Test Clinic", address: "100 Main St, Kent, WA 98032", parking: "Lot C", contact: "Dana Nurse", contactMethod: "(253) 555-0142" },
    prepNotes: "Maria Lopez (DOB 05/09/1991, WA 102195953WA) has a follow-up. Please arrive 10 minutes early.",
    privateNotes: "Section 5: hearing identity, comments",
    requester: { name: "Requester Person", email: "requester@example.org" },
    rawContent: "the forwarded email",
  };

  it("sends a pending offer the scrubbed notes and the mental health yes / no, and nothing private", () => {
    const view = interpreterJobView(data, "offer");
    assert.equal(view.mentalHealth, true);
    assert.equal(view.prepNotes, "");
    assert.match(view.offerNotes, /Please arrive 10 minutes early/);
    const sent = JSON.stringify(view);
    for (const leak of [SECRETS.clientName, "Maria", "Lopez", "1991", "102195953", SECRETS.priorAuth, "U3 U9", "U9", "Section 5", "requester@example.org", "Requester Person", "Someone Specific", "forwarded email", "Lot C", "Dana Nurse", "555-0142"]) {
      assert.ok(!sent.includes(leak), `offer view leaks "${leak}"`);
    }
  });

  it("sends a closed offer no notes and no flag", () => {
    const view = interpreterJobView(data, "closed");
    assert.equal(view.offerNotes, "");
    assert.equal(view.mentalHealth, false);
    assert.ok(!JSON.stringify(view).includes("arrive 10 minutes early"));
  });

  it("gives a booked interpreter the notes as written (and still never the billing fields)", () => {
    const view = interpreterJobView(data, "booked");
    assert.equal(view.prepNotes, data.prepNotes);
    assert.equal(view.offerNotes, "");
    const sent = JSON.stringify(view);
    for (const leak of [SECRETS.priorAuth, "U3 U9", "Section 5", "requester@example.org"]) assert.ok(!sent.includes(leak), leak);
  });
});
