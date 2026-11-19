import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { isJobNeedingHours } from "@/utils/hoursState";

const savedStart = process.env.HOURS_SLA_START;
beforeEach(() => {
  delete process.env.HOURS_SLA_START; // the default rule start: 2026-11-16
});
afterEach(() => {
  if (savedStart === undefined) delete process.env.HOURS_SLA_START;
  else process.env.HOURS_SLA_START = savedStart;
});

const job = (over: Record<string, unknown>) => ({ id: "o1", status: "booked", isStateJob: false, startsAt: "2026-11-18T17:00:00Z", endsAt: "2026-11-18T18:00:00Z", ...over });
const NOW = Date.parse("2026-11-19T20:00:00Z");

describe("isJobNeedingHours with State jobs", () => {
  it("leaves State jobs out by default (hours are reported in the state's portal)", () => {
    assert.equal(isJobNeedingHours(job({ isStateJob: true }), [], NOW), false);
  });

  it("lists a recent State job that needs its form when the list asks for State jobs", () => {
    assert.equal(isJobNeedingHours(job({ isStateJob: true }), [], NOW, { includeState: true }), true);
  });

  it("does not list an old State job, however long ago it ended (the rule's start date)", () => {
    const old = job({ isStateJob: true, startsAt: "2026-10-02T17:00:00Z", endsAt: "2026-10-02T18:00:00Z" });
    assert.equal(isJobNeedingHours(old, [], NOW, { includeState: true }), false);
  });

  it("does not list a State job whose appointment has not ended", () => {
    const future = job({ isStateJob: true, startsAt: "2026-11-20T17:00:00Z", endsAt: "2026-11-20T18:00:00Z" });
    assert.equal(isJobNeedingHours(future, [], NOW, { includeState: true }), false);
  });

  it("is unchanged for an ordinary job: listed after it ends, with or without the State option", () => {
    assert.equal(isJobNeedingHours(job({}), [], NOW), true);
    assert.equal(isJobNeedingHours(job({}), [], NOW, { includeState: true }), true);
  });
});
