import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertCancellationForm, cancellationOf } from "@/lib/interpreterCancellation";
import type { CancelledRequest } from "@/lib/interpreterCancellation";

/** A cancelled request whose appointment starts at `startsAt`, cancelled at `at` (ISO instants). */
const request = (startsAt: string, at: string, billingStatus: string | null = null): CancelledRequest => ({
  canceledAt: new Date(at),
  billingStatus,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  data: { startsAt, endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(), cancellation: { at } },
});

describe("cancellationOf (what the interpreter is told)", () => {
  it("is billable with less than 2 business days of notice", () => {
    // Cancelled Thursday 9:00 AM PST for Friday 9:00 AM PST: 9 business hours of notice, under the 18 needed.
    const out = cancellationOf(request("2026-11-20T17:00:00Z", "2026-11-19T17:00:00Z"));
    assert.equal(out.billable, true);
    assert.equal(out.cancelledAt, "2026-11-19T17:00:00.000Z");
  });

  it("is not billable with 2 or more business days of notice", () => {
    // Cancelled Monday 9:00 AM for Thursday 9:00 AM: 27 business hours.
    assert.equal(cancellationOf(request("2026-11-19T17:00:00Z", "2026-11-16T17:00:00Z")).billable, false);
  });

  it("counts a cancellation after the start as billable", () => {
    assert.equal(cancellationOf(request("2026-11-19T17:00:00Z", "2026-11-19T18:00:00Z")).billable, true);
  });

  it("does not count Washington State holidays as business days (Thanksgiving week)", () => {
    // Wednesday Nov 25 9:00 AM for Monday Nov 30 9:00 AM: Thursday and Friday are holidays, so only 9 business hours remain.
    assert.equal(cancellationOf(request("2026-11-30T17:00:00Z", "2026-11-25T17:00:00Z")).billable, true);
    // The same notice with the holidays removed would be 27 hours and not billable.
    assert.equal(cancellationOf(request("2026-11-30T17:00:00Z", "2026-11-25T17:00:00Z"), { settings: { businessDayStartMinute: 480, businessDayEndMinute: 1020, cancelNoticeBusinessDays: 2 }, holidays: [] }).billable, false);
  });

  it("uses the agency's own notice setting when billing is set up", () => {
    const strict = { settings: { businessDayStartMinute: 480, businessDayEndMinute: 1020, cancelNoticeBusinessDays: 5 }, holidays: [] };
    assert.equal(cancellationOf(request("2026-11-19T17:00:00Z", "2026-11-16T17:00:00Z"), strict).billable, true);
  });

  it("follows staff's override over the rule, either way", () => {
    assert.equal(cancellationOf(request("2026-11-19T17:00:00Z", "2026-11-16T17:00:00Z", "cancelled_billable")).billable, true);
    assert.equal(cancellationOf(request("2026-11-20T17:00:00Z", "2026-11-19T17:00:00Z", "cancelled_not_billable")).billable, false);
  });

  it("falls back to the row's cancelled-at when the job has no cancellation record", () => {
    const req: CancelledRequest = { ...request("2026-11-20T17:00:00Z", "2026-11-19T17:00:00Z"), data: { startsAt: "2026-11-20T17:00:00Z" } };
    assert.equal(cancellationOf(req).billable, true);
  });

  it("carries only a verdict and a time (nothing about the job)", () => {
    assert.deepEqual(Object.keys(cancellationOf(request("2026-11-20T17:00:00Z", "2026-11-19T17:00:00Z"))).sort(), ["billable", "cancelledAt"]);
  });
});

describe("assertCancellationForm (checked on the server)", () => {
  const ok = { note: "Cancelled by the agency the day before." };

  it("needs a note", () => {
    assert.throws(() => assertCancellationForm({ note: "   " }), /note about the cancellation/);
    assert.throws(() => assertCancellationForm({ note: undefined }), /note about the cancellation/);
  });

  it("accepts no travel at all", () => {
    assert.doesNotThrow(() => assertCancellationForm(ok));
    assert.doesNotThrow(() => assertCancellationForm({ ...ok, travelStart: null, travelEnd: "" }));
  });

  it("accepts a real travel window", () => {
    assert.doesNotThrow(() => assertCancellationForm({ ...ok, travelStart: "2026-11-19T16:00:00Z", travelEnd: "2026-11-19T16:45:00Z" }));
  });

  it("refuses half a window, a backwards window, an unreadable one, or more than a day", () => {
    assert.throws(() => assertCancellationForm({ ...ok, travelStart: "2026-11-19T16:00:00Z" }), /both the start and the end/);
    assert.throws(() => assertCancellationForm({ ...ok, travelStart: "2026-11-19T17:00:00Z", travelEnd: "2026-11-19T16:00:00Z" }), /after travel start/);
    assert.throws(() => assertCancellationForm({ ...ok, travelStart: "soon", travelEnd: "later" }), /not valid/);
    assert.throws(() => assertCancellationForm({ ...ok, travelStart: "2026-11-19T00:00:00Z", travelEnd: "2026-11-20T01:00:00Z" }), /24 hours/);
  });
});
