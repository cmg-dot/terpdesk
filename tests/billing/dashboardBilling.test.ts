import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dashboardBillingOf } from "@/lib/dashboardBilling";
import type { PayPeriod } from "@/lib/billing/payPeriods";

const saved = (start: string, end: string, cutoffAt: string | null, payDate: string | null): PayPeriod => ({ id: `id-${start}`, start, end, cutoffAt, payDate, saved: true });
const NOV_1 = saved("2026-11-01", "2026-11-15", "2026-11-20T20:00:00.000Z", "2026-11-30");
const OCT_16 = saved("2026-10-16", "2026-10-31", "2026-11-06T20:00:00.000Z", "2026-11-16");

describe("dashboardBillingOf", () => {
  it("is the latest period that has ended, with its cutoff and pay date", () => {
    // Nov 10 is inside Nov 1-15, so the period being invoiced and paid is the one before it.
    const card = dashboardBillingOf([OCT_16, NOV_1], "2026-11-10", Date.parse("2026-11-10T18:00:00Z"));
    assert.deepEqual(card, { periodId: "id-2026-10-16", start: "2026-10-16", end: "2026-10-31", cutoffAt: OCT_16.cutoffAt, cutoffPassed: true, payDate: "2026-11-16" });
  });

  it("from the 16th it has moved on to the half that just ended", () => {
    const card = dashboardBillingOf([OCT_16, NOV_1], "2026-11-18", Date.parse("2026-11-18T18:00:00Z"));
    assert.deepEqual([card.start, card.end, card.cutoffPassed], ["2026-11-01", "2026-11-15", false]);
  });

  it("flags the cutoff as passed only once it has", () => {
    const before = dashboardBillingOf([NOV_1], "2026-11-18", Date.parse("2026-11-20T19:59:00Z"));
    const after = dashboardBillingOf([NOV_1], "2026-11-18", Date.parse("2026-11-20T20:00:00Z"));
    assert.equal(before.cutoffPassed, false);
    assert.equal(after.cutoffPassed, true);
  });

  it("a standard half-month has no cutoff and no pay date, and never reads as passed", () => {
    const card = dashboardBillingOf([], "2026-11-18", Date.parse("2026-11-18T18:00:00Z"));
    assert.deepEqual([card.periodId, card.start, card.end, card.cutoffAt, card.cutoffPassed, card.payDate], ["std:2026-11-01", "2026-11-01", "2026-11-15", null, false, null]);
  });

  it("carries dates only: no amounts, names or job details", () => {
    const card = dashboardBillingOf([NOV_1], "2026-11-18", Date.now());
    assert.deepEqual(Object.keys(card).sort(), ["cutoffAt", "cutoffPassed", "end", "payDate", "periodId", "start"]);
  });
});
