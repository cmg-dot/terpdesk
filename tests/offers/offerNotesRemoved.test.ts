import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpreterJobView } from "@/lib/interpreterJobData";
import { scrubOfferNotes } from "@/lib/offerNotes";

/** Every person and number here is made up. */
const SECRETS = { clientName: "Maria Lopez", clientDob: "1991-05-09", providerOne: "102195953WA", priorAuth: "101578781" };

describe("scrubOfferNotes", () => {
  it("says everything was removed when notes were written but nothing readable is left", () => {
    assert.deepEqual(scrubOfferNotes("Maria Lopez 2272820", SECRETS), { text: "", removed: true });
    assert.deepEqual(scrubOfferNotes("(253) 555-0142", SECRETS), { text: "", removed: true });
  });

  it("is not 'removed' when the agency wrote nothing", () => {
    for (const blank of ["", "   ", null, undefined]) assert.deepEqual(scrubOfferNotes(blank, SECRETS), { text: "", removed: false });
  });

  it("is not 'removed' when readable guidance is left (the removals read [removed] inside it)", () => {
    const out = scrubOfferNotes("Park in lot B. Client is Maria Lopez.", SECRETS);
    assert.equal(out.removed, false);
    assert.match(out.text, /Park in lot B/);
  });
});

describe("interpreterJobView: offerNotesRemoved", () => {
  const data = { details: { deafParticipant: "Maria Lopez" }, prepNotes: "Maria Lopez 2272820" };

  it("is true on a live offer whose notes were all client detail, and the notes are empty", () => {
    const view = interpreterJobView(data, "offer");
    assert.equal(view.offerNotes, "");
    assert.equal(view.offerNotesRemoved, true);
  });

  it("is false for a booked interpreter (they get the notes as written) and for a closed offer", () => {
    assert.equal(interpreterJobView(data, "booked").offerNotesRemoved, false);
    assert.equal(interpreterJobView(data, "closed").offerNotesRemoved, false);
  });

  it("is false on an offer with no notes at all", () => {
    assert.equal(interpreterJobView({ details: {} }, "offer").offerNotesRemoved, false);
  });
});
