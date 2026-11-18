import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarFrom } from "@/lib/billing/businessCalendar";
import { jobFacts } from "@/lib/billing/facts";
import type { FactsContext, RawRequest } from "@/lib/billing/facts";
import { jobLedger } from "@/lib/billing/lines";
import { parseServiceVerification } from "@/lib/odhhVerificationParser";
import { readTravelWindows, totalTravelMinutes, windowsFromWallClock } from "@/lib/travelWindows";
import { computeTravelWindows } from "@/lib/verificationTimes";
import { mergeHoursRecords } from "@/utils/hoursReviewRecords";
import type { SubmittedTimesheet } from "@/app/actions/getSubmittedTimesheets";
import { amounts, settings } from "./fixtures";

/**
 * Travel time from the state's service verification (SLICR "Assignment Report"), there and back, and what billing makes of it. The
 * report layout is Kari's sample (#202786075, the page behind invoice #55599); names, numbers and the travel times are made up.
 */
const ZONE = "America/Los_Angeles";
const slicr = (travel: string) => `signlanguageinterpreters@dshs.wa.gov
SLICR - Assignment Report #202786075
This email is the SERVICE VERIFICATION for the assignment below. All Sign Language Interpreters are required to sign this form.
Sign Language Interpreter Service Request Number #202786075
APPOINTMENT INFORMATION
Organization: Test Clinic
Purchaser: Test Purchaser
BOOKING Appointment Date and Time: 10/15/2026 4:00:00 PM - 10/15/2026 5:30:00 PM
Interpreter: 603 - Sample Interpreter (CT , CI )
BILLING INFORMATION
From Address:
To Address:
Actual Start Time:04:07 PM
Actual End Time:04:57 PM
Total Actual Minutes:50
${travel}
Total Miles:12
Other Fee(s):
Other Fee(s):
VERIFICATION INFORMATION
Service Complete - Yes`;

const TWO_LEGS = "Travel Start Time:03:15 PM\nTravel End Time:04:00 PM\nTravel Start Time:05:00 PM\nTravel End Time:05:50 PM";
const BLANK = "Travel Start Time:\nTravel End Time:\nTravel Start Time:\nTravel End Time:";

describe("SLICR travel parsing", () => {
  it("reads both travel legs, there and back, beside the service time and miles", () => {
    const p = parseServiceVerification(slicr(TWO_LEGS));
    assert.equal(p.srn, "202786075");
    assert.equal(p.startTime, "16:07");
    assert.equal(p.totalMiles, 12);
    assert.deepEqual(p.travel, [
      { startDate: null, startTime: "15:15", endDate: null, endTime: "16:00" },
      { startDate: null, startTime: "17:00", endDate: null, endTime: "17:50" },
    ]);
  });

  it("reads none from Kari's sample, where the travel lines are blank", () => {
    const p = parseServiceVerification(slicr(BLANK));
    assert.deepEqual(p.travel, []);
    assert.equal(p.totalMiles, 12);
  });

  it("keeps a single leg, skips a leg missing its end, and never takes Travel Miles for a time", () => {
    assert.equal(parseServiceVerification(slicr("Travel Start Time:03:15 PM\nTravel End Time:04:00 PM\nTravel Start Time:\nTravel End Time:")).travel.length, 1);
    assert.equal(parseServiceVerification(slicr("Travel Start Time:03:15 PM\nTravel End Time:\nTravel Miles: 4")).travel.length, 0);
    const dated = parseServiceVerification(slicr("Travel Start Time: 10/15/2026 3:15 PM\nTravel End Time: 10/15/2026 4:00 PM")).travel[0];
    assert.deepEqual(dated, { startDate: "2026-10-15", startTime: "15:15", endDate: "2026-10-15", endTime: "16:00" });
  });

  it("dates the legs on the service day in the job's zone (95 minutes in all)", () => {
    const p = parseServiceVerification(slicr(TWO_LEGS));
    const windows = computeTravelWindows(p, "2026-10-15T23:00:00.000Z", ZONE, new Date("2026-10-15T23:07:00.000Z"));
    assert.deepEqual(windows, [
      { start: "2026-10-15T22:15:00.000Z", end: "2026-10-15T23:00:00.000Z" },
      { start: "2026-10-16T00:00:00.000Z", end: "2026-10-16T00:50:00.000Z" },
    ]);
    assert.equal(totalTravelMinutes(windows), 95);
  });

  it("takes a leg past midnight as ending the next day, and drops one longer than 12 hours", () => {
    const [overnight] = windowsFromWallClock([{ startDate: null, startTime: "23:30", endDate: null, endTime: "00:20" }], "2026-12-01", ZONE);
    assert.equal(totalTravelMinutes([overnight]), 50);
    assert.deepEqual(windowsFromWallClock([{ startDate: "2026-12-01", startTime: "06:00", endDate: "2026-12-01", endTime: "19:00" }], "2026-12-01", ZONE), []);
  });

  it("reads a timesheet's stored legs, ignoring anything malformed", () => {
    const data = { travelWindows: { t1: [{ start: "2026-10-15T22:15:00.000Z", end: "2026-10-15T23:00:00.000Z" }, { start: "x", end: "y" }] } };
    assert.equal(readTravelWindows(data, "t1")?.length, 1);
    assert.equal(readTravelWindows(data, "t2"), null);
    assert.equal(readTravelWindows({}, "t1"), null);
  });
});

/** An in-person Apple Health job whose hours came from the SLICR report: mirrored hours slot + the timesheet's two travel legs. */
const INTERPRETER = "c1111111-1111-4111-8111-111111111111";
const SHEET = "d1111111-1111-4111-8111-111111111111";
const legs = [
  { start: "2026-10-15T22:15:00.000Z", end: "2026-10-15T23:00:00.000Z" },
  { start: "2026-10-16T00:00:00.000Z", end: "2026-10-16T00:50:00.000Z" },
];
const hcaJob = (slot: Record<string, unknown> = {}): RawRequest => ({
  id: "e1111111-1111-4111-8111-111111111111",
  status: "completed",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  canceledAt: null,
  isStateJob: true,
  billingStatus: null,
  data: {
    brief: {},
    intake: { program: "WA Apple Health", odhhSrn: "202786075" },
    details: { format: "In person", timeZone: ZONE, startDate: "2026-10-15", startTime: "16:00", endTime: "17:30" },
    onsite: { venue: "Test Clinic", address: "2150 Fir Street, Tacoma, WA 98402" },
    hoursSubmissions: { 1: { status: "approved", interpreterId: INTERPRETER, timesheetId: SHEET, actualStartTime: "2026-10-15T23:07:00.000Z", actualEndTime: "2026-10-15T23:57:00.000Z", travelStartTime: legs[0].start, travelEndTime: legs[0].end, approvedMileage: 12, ...slot } },
    travelWindows: { [SHEET]: legs },
  },
});
const ctx = (eveningCents: number | null = null): FactsContext => ({
  settings: settings(),
  calendar: calendarFrom(settings(), []),
  names: new Map([[INTERPRETER, "Sample Interpreter"]]),
  rates: new Map([[INTERPRETER, { stateCents: 9400, kingCountyCents: null, nonStateCents: null, eveningCents }]]),
  commercialAutoUntil: new Map([[INTERPRETER, "2027-06-30"]]),
  clients: [],
});

describe("HCA travel billing", () => {
  it("pays and bills both legs (95 min) at the interpreter's rate, with the usual HCA lines", () => {
    const facts = jobFacts(hcaJob(), [], [], ctx());
    assert.ok(facts);
    assert.equal(facts.positions[0].travelMinutes, 95);
    const l = jobLedger(facts, settings());
    assert.deepEqual(amounts(l.positions[0].bill), { service: 14100, base_add_on: 4700, travel: 14883, mileage: 912, vendor_fee: 7500, onsite_fee: 1000 });
    assert.equal(l.billTotalCents, 43095);
    assert.deepEqual(amounts(l.positions[0].pay), { service: 14100, base_add_on: 4700, travel: 14883, mileage: 912, commercial_auto: 1000 });
  });

  it("uses the minutes staff approved at review instead", () => {
    const l = jobLedger(jobFacts(hcaJob({ approvedTravelMinutes: 90 }), [], [], ctx()) ?? assert.fail(), settings());
    assert.equal(amounts(l.positions[0].pay).travel, 14100);
  });

  it("splits the evening minutes across both legs (5 PM to 6 AM: only the 50-minute return)", () => {
    const evening = settings({ eveningStartMinute: 17 * 60, eveningEndMinute: 6 * 60 });
    const facts = jobFacts(hcaJob(), [], [], { ...ctx(11000), settings: evening });
    const pay = amounts(jobLedger(facts ?? assert.fail(), evening).positions[0].pay);
    assert.equal(pay.travel, Math.round((45 * 9400) / 60));
    assert.equal(pay.travel_evening, Math.round((50 * 11000) / 60));
  });
});

describe("Hours review shows both legs", () => {
  it("reports 95 travel minutes and both windows on the verification's record", () => {
    const request = { id: "e1", title: "T", status: "awaiting_review", startsAt: "2026-10-15T23:00:00.000Z", endsAt: "2026-10-16T00:30:00.000Z", isStateJob: true, canceledAt: null, offers: [], details: { timeZone: ZONE }, data: { intake: { program: "WA Apple Health" }, hoursSubmissions: { 1: { timesheetId: SHEET, status: "awaiting_review" } }, travelWindows: { [SHEET]: legs } } };
    const sheet = { timesheetId: SHEET, requestId: "e1", title: "T", reference: "SRN #202786075", interpreterName: "Sample", status: "submitted", isOdhh: false, isVirtual: false, travelStart: legs[0].start, travelEnd: legs[0].end, travelLegs: [] } as unknown as SubmittedTimesheet;
    const [record] = mergeHoursRecords({ localRecords: [], requests: [request], timesheets: [sheet] });
    assert.equal(record.reportedTravelMinutes, 95);
    assert.equal(record.travelWindows?.length, 2);
    assert.equal(record.stateJob, true);
  });
});
