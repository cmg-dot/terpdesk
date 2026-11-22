import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { exceedsScheduled } from "@/lib/hoursReviewSummary";
import { OVERTIME_NOTE_REQUIRED, exceedsScheduledLabel, formatOvertime, minutesOverSchedule, overtimeNeedsNote, overtimeWarning, workedMinutesBetween } from "@/lib/scheduledOvertime";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

// The test runner compiles JSX in classic mode: the components need React in scope.
(globalThis as { React?: typeof React }).React = React;

// A DDA shift booked 8:00 to 16:00, shortened to 8:00 to 12:00 (Pacific Time), and reported as the full 8 hours.
const record = (over: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id: "r1",
  appointmentId: "req-1",
  interpreterName: "Interpreter",
  state: "awaiting_review",
  scheduledStart: "2026-11-24T16:00:00.000Z",
  scheduledEnd: "2026-11-24T20:00:00.000Z",
  actualStart: "2026-11-24T16:00:00.000Z",
  actualEnd: "2026-11-25T00:00:00.000Z",
  breakMinutes: 0,
  reportedMileage: 0,
  approvedMileage: null,
  reviewMessage: null,
  version: 1,
  timeZone: "America/Los_Angeles",
  ...over,
});

describe("Phase 32.3: time past the current schedule", () => {
  it("counts whole minutes over, and nothing within the schedule or when a length is unknown", () => {
    assert.equal(minutesOverSchedule(480, 240), 240);
    assert.equal(minutesOverSchedule(240, 240), 0);
    assert.equal(minutesOverSchedule(200, 240), 0);
    assert.equal(minutesOverSchedule(NaN, 240), 0);
    assert.equal(minutesOverSchedule(480, 0), 0);
    assert.equal(workedMinutesBetween("2026-11-24T16:00:00Z", "2026-11-25T00:00:00Z", 30), 450);
    assert.ok(Number.isNaN(workedMinutesBetween(null, "2026-11-25T00:00:00Z")));
  });

  it("labels it +Xh Ym, and asks for a note only when there is overtime and no note", () => {
    assert.equal(formatOvertime(240), "+4h 0m");
    assert.equal(exceedsScheduledLabel(95), "Exceeds scheduled (+1h 35m)");
    assert.ok(overtimeNeedsNote(240, ""));
    assert.ok(overtimeNeedsNote(240, "   "));
    assert.ok(!overtimeNeedsNote(240, "Stayed for the family meeting at the agency's request"));
    assert.ok(!overtimeNeedsNote(0, ""));
    for (const copy of [overtimeWarning(240, "4 hr 0 min"), OVERTIME_NOTE_REQUIRED]) assert.ok(!copy.includes("—"), copy);
  });
});

describe("Phase 32.3: Hours review flags it before approval", () => {
  it("shows exceedsScheduled for 8 hours reported on a shift shortened to 4", () => {
    assert.equal(exceedsScheduled(record()), 240);
    assert.equal(exceedsScheduledLabel(exceedsScheduled(record()) ?? 0), "Exceeds scheduled (+4h 0m)");
  });

  it("takes the break off first, and is silent within the schedule, on a cancellation form or on a closed job", () => {
    assert.equal(exceedsScheduled(record({ breakMinutes: 30 })), 210);
    assert.equal(exceedsScheduled(record({ actualEnd: "2026-11-24T20:00:00.000Z" })), null);
    assert.equal(exceedsScheduled(record({ cancelledBillable: true })), null);
    assert.equal(exceedsScheduled(record({ jobClosed: "cancelled" })), null);
  });

  it("puts the pill on the folded record row", async () => {
    const { RecordSummaryRow } = await import("@/components/features/hours-review/RecordSummaryRow");
    const html = renderToStaticMarkup(React.createElement(RecordSummaryRow, { record: record(), expanded: false, onToggle: () => undefined, panelId: "p" }));
    assert.ok(html.includes("Exceeds scheduled (+4h 0m)"), "pill shown");
    const fine = renderToStaticMarkup(React.createElement(RecordSummaryRow, { record: record({ actualEnd: "2026-11-24T20:00:00.000Z" }), expanded: false, onToggle: () => undefined, panelId: "p" }));
    assert.ok(!fine.includes("Exceeds scheduled"));
  });
});

describe("Phase 32.3: the interpreter's hours form", () => {
  const noop = () => undefined;
  const form = async (over: { workedMinutes?: number; note?: string }) => {
    const { InterpreterSubmitForm } = await import("@/components/features/InterpreterSubmitForm");
    return renderToStaticMarkup(React.createElement(InterpreterSubmitForm, {
      isFutureAppointment: false, isSubmitting: false, isOdhh: false, timeZoneLabel: "Pacific Time", odhhPortalUrl: "",
      actualStart: "2026-11-24T08:00", actualEnd: "2026-11-24T16:00", onActualStartChange: noop, onActualEndChange: noop,
      breakMinutes: "0", onBreakMinutesChange: noop, travelStart: "", travelEnd: "", onTravelStartChange: noop, onTravelEndChange: noop,
      serviceCompleted: "yes", onServiceCompletedChange: noop, serviceTimeHours: "8 hr 0 min", scheduledMinutes: 240,
      mileageLegs: [], totalMileage: 0, onAddLeg: noop, onRemoveLeg: noop, onUpdateLeg: noop, mileageNote: "", onMileageNoteChange: noop,
      note: over.note ?? "", onNoteChange: noop, hasSignature: true, onSignatureChange: noop, onSubmit: noop, workedMinutes: over.workedMinutes,
    }));
  };
  const submitDisabled = (html: string) => /<button[^>]*disabled=""[^>]*>Submit actual hours<\/button>/.test(html);

  it("warns when the entered time runs past the updated schedule, and waits for a note", async () => {
    const html = await form({ workedMinutes: 480 });
    assert.ok(html.includes("data-overtime-warning"));
    assert.ok(html.includes("These times are +4h 0m longer than the scheduled 4 hr 0 min."));
    assert.ok(submitDisabled(html), "submit waits for a note");
  });

  it("lets overtime through once a note explains it, and shows nothing within the schedule", async () => {
    const withNote = await form({ workedMinutes: 480, note: "Stayed at the provider's request" });
    assert.ok(withNote.includes("data-overtime-warning") && !submitDisabled(withNote));
    const within = await form({ workedMinutes: 240 });
    assert.ok(!within.includes("data-overtime-warning") && !submitDisabled(within));
  });
});
