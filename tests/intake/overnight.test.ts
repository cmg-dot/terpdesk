import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENDS_NEXT_DAY_WARNING, appointmentTimes, nextIsoDay } from "@/lib/odhhSchedule";
import { parseServiceVerification } from "@/lib/odhhVerificationParser";
import { computeTimes } from "@/lib/verificationTimes";

const ZONE = "America/Los_Angeles";
const times = (start24: string, end24: string, isoDate = "2026-11-12") => {
  const warnings: string[] = [];
  return { ...appointmentTimes({ isoDate, start24, end24 }, warnings), warnings };
};

describe("overnight appointments on the request form", () => {
  it("keeps an ordinary same-day appointment as it was, with no warning", () => {
    const t = times("09:00", "11:00");
    assert.equal(t.startsAt?.toISOString(), "2026-11-12T17:00:00.000Z");
    assert.equal(t.endsAt?.toISOString(), "2026-11-12T19:00:00.000Z");
    assert.deepEqual(t.warnings, []);
  });

  it("reads 9:45 PM to 1:00 AM as ending the next morning, flagged 'Ends next day'", () => {
    const t = times("21:45", "01:00");
    assert.equal(t.startsAt?.toISOString(), "2026-11-13T05:45:00.000Z");
    assert.equal(t.endsAt?.toISOString(), "2026-11-13T09:00:00.000Z");
    assert.deepEqual(t.warnings, [ENDS_NEXT_DAY_WARNING]);
  });

  it("accepts up to 16 hours across midnight (5:25 PM to 1:00 AM; 9:25 PM to 1:00 PM)", () => {
    assert.ok(times("17:25", "01:00").endsAt);
    assert.equal(times("21:25", "13:00").warnings[0], ENDS_NEXT_DAY_WARNING);
  });

  it("still refuses the same start and end (a typo) and a rollover longer than 16 hours", () => {
    for (const [start, end] of [["01:00", "01:00"], ["13:25", "13:00"], ["11:00", "03:30"]]) {
      const t = times(start, end);
      assert.equal(t.startsAt, null, `${start}-${end}`);
      assert.equal(t.endsAt, null);
      assert.ok(t.warnings.includes("End time is not after start time"));
      assert.ok(!t.warnings.includes(ENDS_NEXT_DAY_WARNING));
    }
  });

  it("rolls over a month and a year end, and keeps the Pacific clock across the DST change", () => {
    assert.equal(nextIsoDay("2026-11-30"), "2026-12-01");
    assert.equal(nextIsoDay("2026-12-31"), "2027-01-01");
    // 31 Oct 2026 10 PM PDT to 1 Nov 2:00 AM PST: DST ends at 2 AM, so 5 hours, not 4.
    const t = times("22:00", "02:00", "2026-10-31");
    assert.equal(((t.endsAt?.getTime() ?? 0) - (t.startsAt?.getTime() ?? 0)) / 3_600_000, 5);
  });
});

const NOW = Date.parse("2026-11-20T08:00:00Z");
const report = (over: Partial<ReturnType<typeof parseServiceVerification>>) => ({ startDate: null, endDate: null, bookingDate: "2026-11-12", travel: [], startTime: "09:00", endTime: "10:00", ...over });

describe("overnight service on the state's hours report", () => {
  it("reads an undated end before the start as the next morning", () => {
    const t = computeTimes(report({ startTime: "21:30", endTime: "01:00" }), "2026-11-13T05:30:00.000Z", ZONE, NOW);
    assert.ok(typeof t !== "string");
    assert.equal(t.start.toISOString(), "2026-11-13T05:30:00.000Z");
    assert.equal(t.end.toISOString(), "2026-11-13T09:00:00.000Z");
    assert.equal(t.endsNextDay, true);
  });

  it("still refuses equal times, and an end date the report states itself", () => {
    assert.equal(computeTimes(report({ startTime: "13:00", endTime: "13:00" }), "2026-11-12T21:00:00.000Z", ZONE, NOW), "The actual end time must be after the actual start time.");
    assert.equal(typeof computeTimes(report({ startTime: "21:30", endTime: "01:00", endDate: "2026-11-12" }), "2026-11-13T05:30:00.000Z", ZONE, NOW), "string");
  });

  it("dates undated times by the report's booking date, not the job's stored day", () => {
    // The job says Dec 8 (a later date of the same request); the report's booking date is Nov 12: no longer "in the future".
    const t = computeTimes(report({}), "2026-12-08T17:00:00.000Z", ZONE, NOW);
    assert.ok(typeof t !== "string");
    assert.equal(t.start.toISOString(), "2026-11-12T17:00:00.000Z");
    assert.equal(t.endsNextDay, false);
  });
});

const SLICR = `SLICR - Assignment Report #202786075
This email is the SERVICE VERIFICATION for the assignment below.
Sign Language Interpreter Service Request Number #202786075
BOOKING Appointment Date and Time: 10/15/2026 4:00:00 PM - 10/15/2026 5:30:00 PM
Interpreter: 603 - Sample Interpreter (CT , CI )
Actual Start Time:04:07 PM
Actual End Time:04:57 PM
Total Miles:12
Service Complete - Yes`;

describe("the SLICR booking date", () => {
  it("is read from 'BOOKING Appointment Date and Time'", () => {
    const p = parseServiceVerification(SLICR);
    assert.equal(p.bookingDate, "2026-10-15");
    assert.equal(p.startDate, null);
  });

  it("is null when the report has no booking line", () => {
    assert.equal(parseServiceVerification(SLICR.replace(/^BOOKING.*$/m, "")).bookingDate, null);
  });
});
