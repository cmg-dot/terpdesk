import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { businessMinutesBetween, calendarFrom, judgeCancellation } from "@/lib/billing/businessCalendar";
import { waStateHolidays } from "@/lib/billing/holidays";
import { jobLedger } from "@/lib/billing/lines";
import { amounts, job, position, rates, settings } from "./fixtures";

/** The 48-business-hour rule: Monday-Friday 8 AM-5 PM Pacific, holidays excluded; under 2 business days of notice = billable. */
const holidays = [...waStateHolidays(2026), ...waStateHolidays(2027)].map((h) => h.date);
const calendar = calendarFrom(settings(), holidays);
const noHolidays = calendarFrom(settings(), []);
const pt = (local: string, offset = "-08:00") => new Date(`${local}${offset}`);
const judge = (cancelled: Date, start: Date, cal = calendar) => judgeCancellation(cancelled, start, cal, 2);

describe("business calendar", () => {
  it("counts only 8 AM-5 PM on weekdays", () => {
    // Fri 3 PM -> Mon 10 AM: Fri 2 h + Mon 2 h.
    assert.equal(businessMinutesBetween(pt("2026-12-04T15:00"), pt("2026-12-07T10:00"), calendar), 240);
    // Sat to Sun: nothing.
    assert.equal(businessMinutesBetween(pt("2026-12-05T09:00"), pt("2026-12-06T17:00"), calendar), 0);
    // Before opening to after closing on one weekday: the full 9 hours.
    assert.equal(businessMinutesBetween(pt("2026-12-08T06:00"), pt("2026-12-08T20:00"), calendar), 540);
  });

  it("holds the business day on the wall clock across the November daylight-saving change", () => {
    // Fri Oct 30 (PDT) 8 AM -> Mon Nov 2 (PST) 5 PM: two full business days.
    assert.equal(businessMinutesBetween(pt("2026-10-30T08:00", "-07:00"), pt("2026-11-02T17:00"), calendar), 1080);
  });
});

describe("48-business-hour cancellations", () => {
  it("exactly 2 business days of notice is not billable; a minute less is", () => {
    assert.equal(judge(pt("2026-12-07T09:00"), pt("2026-12-09T09:00")).suggested, "cancelled_not_billable");
    assert.equal(judge(pt("2026-12-07T09:01"), pt("2026-12-09T09:00")).suggested, "cancelled_billable");
  });

  it("a weekend in between does not count: Friday noon for Tuesday 9 AM is under 2 business days", () => {
    const r = judge(pt("2026-12-04T12:00"), pt("2026-12-08T09:00"));
    assert.equal(r.noticeBusinessMinutes, 5 * 60 + 9 * 60 + 60);
    assert.equal(r.suggested, "cancelled_billable");
  });

  it("Thanksgiving and Native American Heritage Day do not count", () => {
    // Wed Nov 25 10 AM for Mon Nov 30 9 AM: Wed 7 h + Mon 1 h = 8 h with the holidays; 26 h without them.
    const withHolidays = judge(pt("2026-11-25T10:00"), pt("2026-11-30T09:00"));
    assert.equal(withHolidays.noticeBusinessMinutes, 8 * 60);
    assert.equal(withHolidays.suggested, "cancelled_billable");
    assert.equal(judge(pt("2026-11-25T10:00"), pt("2026-11-30T09:00"), noHolidays).suggested, "cancelled_not_billable");
  });

  it("a cancellation after the start has no notice", () => {
    assert.equal(judge(pt("2026-12-08T10:00"), pt("2026-12-08T09:00")).noticeBusinessMinutes, 0);
  });
});

describe("cancelled jobs on the ledger", () => {
  const cancelled = (outcome: "cancelled_billable" | "cancelled_not_billable", category: "state" | "non_state" = "state") =>
    jobLedger(
      job({
        category,
        outcome,
        outcomeSource: "auto",
        inPerson: true,
        scheduledMinutes: 120,
        positions: [position({ hoursState: "missing", workedMinutes: null, travelMinutes: 60, approvedMiles: 40, commercialAuto: true, rates: rates({ stateCents: 6000, nonStateCents: 6800 }) })],
      }),
      settings(),
    );

  it("billable State cancellation: full scheduled hours + 1.5x + submitted travel + vendor fee; no mileage, no onsite fee", () => {
    const l = cancelled("cancelled_billable");
    const bill = amounts(l.positions[0].bill);
    assert.deepEqual(bill, { service: 12000, base_add_on: 3000, travel: 6000, vendor_fee: 7500 });
    const pay = amounts(l.positions[0].pay);
    assert.deepEqual(pay, { service: 12000, base_add_on: 3000, travel: 6000 });
    assert.equal(l.positions[0].pay[0].label, "Late cancellation (scheduled time)");
  });

  it("non-billable State cancellation: pays nothing, still bills the $75 vendor fee", () => {
    const l = cancelled("cancelled_not_billable");
    assert.equal(l.payTotalCents, 0);
    assert.deepEqual(amounts(l.positions[0].bill), { vendor_fee: 7500 });
  });

  it("Non-state cancellations never carry a vendor fee", () => {
    assert.equal(cancelled("cancelled_not_billable", "non_state").billTotalCents, 0);
    assert.deepEqual(amounts(cancelled("cancelled_billable", "non_state").positions[0].bill), { service: 19000, travel: 9500 });
  });

  it("a team of two bills the vendor fee per booked interpreter ($150)", () => {
    const l = jobLedger(job({ outcome: "cancelled_not_billable", positions: [position(), position({ positionId: 2, interpreterId: "99999999-9999-4999-8999-999999999999" })] }), settings());
    assert.equal(l.billTotalCents, 15000);
  });
});
