import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { hoursDueAt, hoursDueInfo } from "@/lib/hoursDue";

const savedStart = process.env.HOURS_SLA_START;
beforeEach(() => {
  delete process.env.HOURS_SLA_START; // the default rule start: 2026-11-16
});
afterEach(() => {
  if (savedStart === undefined) delete process.env.HOURS_SLA_START;
  else process.env.HOURS_SLA_START = savedStart;
});

describe("hoursDueAt", () => {
  it("is 48 business hours after the end: a Friday 3 PM end is due Tuesday 3 PM (Pacific)", () => {
    assert.equal(hoursDueAt(new Date("2026-11-20T23:00:00Z"))?.toISOString(), "2026-11-24T23:00:00.000Z");
  });

  it("starts counting on Monday when the appointment ends on a weekend", () => {
    // Saturday 10 AM PST ends -> the clock starts Monday 00:00 -> due Wednesday 00:00 PST.
    assert.equal(hoursDueAt(new Date("2026-11-21T18:00:00Z"))?.toISOString(), "2026-11-25T08:00:00.000Z");
  });

  it("is null for an unusable end time", () => {
    assert.equal(hoursDueAt("not a time"), null);
  });
});

describe("hoursDueInfo", () => {
  const FRIDAY_3PM = "2026-11-20T23:00:00Z";

  it("reads 'Tue, Nov 24, 3:00 PM PST' and is not overdue before the deadline", () => {
    const info = hoursDueInfo(FRIDAY_3PM, Date.parse("2026-11-24T22:59:00Z"));
    assert.equal(info?.when, "Tue, Nov 24, 3:00 PM PST");
    assert.equal(info?.overdue, false);
  });

  it("is overdue from the deadline itself (the same moment the banner starts listing it)", () => {
    assert.equal(hoursDueInfo(FRIDAY_3PM, Date.parse("2026-11-24T23:00:00Z"))?.overdue, true);
  });

  it("shows nothing for an appointment that ended before the rule began, or with no end", () => {
    assert.equal(hoursDueInfo("2026-11-13T20:00:00Z"), null);
    assert.equal(hoursDueInfo(null), null);
    assert.equal(hoursDueInfo(""), null);
  });
});
