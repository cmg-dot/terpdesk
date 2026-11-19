import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFiledCancellation } from "@/lib/cancellationFiled";
import { mergeHoursRecords } from "@/utils/hoursReviewRecords";

describe("readFiledCancellation", () => {
  it("reads a filed cancellation form", () => {
    const filed = readFiledCancellation({ cancellationForm: true, submittedAt: "2026-11-19T20:00:00Z", travelStartTime: "2026-11-19T16:00:00Z", travelEndTime: "2026-11-19T16:30:00Z", cancellationReason: "Cancelled the day before.", version: 2 });
    assert.deepEqual(filed, { submittedAt: "2026-11-19T20:00:00Z", travelStart: "2026-11-19T16:00:00Z", travelEnd: "2026-11-19T16:30:00Z", note: "Cancelled the day before.", version: 2 });
  });

  it("is null for ordinary hours, nothing, or a malformed value", () => {
    assert.equal(readFiledCancellation({ status: "awaiting_review", actualStartTime: "2026-11-19T17:00:00Z" }), null);
    assert.equal(readFiledCancellation(null), null);
    assert.equal(readFiledCancellation("cancellationForm"), null);
    assert.equal(readFiledCancellation({ cancellationForm: "true" }), null);
  });

  it("tolerates missing parts", () => {
    assert.deepEqual(readFiledCancellation({ cancellationForm: true }), { submittedAt: "", travelStart: "", travelEnd: "", note: "", version: 1 });
  });
});

describe("Hours review: a cancellation form on a cancelled job", () => {
  const request = (hours: Record<string, unknown>) => ({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Clinic visit",
    status: "Cancelled",
    canceledAt: "2026-11-19T17:00:00.000Z",
    startsAt: "2026-11-20T17:00:00.000Z",
    endsAt: "2026-11-20T18:00:00.000Z",
    isVirtual: false,
    offers: [],
    data: { startsAt: "2026-11-20T17:00:00.000Z", endsAt: "2026-11-20T18:00:00.000Z", hoursSubmissions: { 1: hours } },
  });
  const form = { cancellationForm: true, status: "awaiting_review", interpreterName: "Test Interpreter", actualStartTime: "2026-11-20T17:00:00.000Z", actualEndTime: "2026-11-20T18:00:00.000Z", serviceCompleted: false, cancellationReason: "Cancelled the day before." };

  it("makes a record marked billable, on a closed job, so nothing is left to approve", () => {
    const [record] = mergeHoursRecords({ localRecords: [], requests: [request(form)], timesheets: [] });
    assert.equal(record.cancelledBillable, true);
    assert.equal(record.jobClosed, "cancelled");
    assert.equal(record.interpreterName, "Test Interpreter");
    assert.equal(record.serviceCompleted, false);
  });

  it("does not mark ordinary hours on a cancelled job as a cancellation form", () => {
    const [record] = mergeHoursRecords({ localRecords: [], requests: [request({ ...form, cancellationForm: undefined })], timesheets: [] });
    assert.equal(record.cancelledBillable, undefined);
    assert.equal(record.jobClosed, "cancelled");
  });
});
