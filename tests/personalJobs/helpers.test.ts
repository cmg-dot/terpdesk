import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_JOB_CSV_HEADER,
  countedMiles,
  personalJobCsvRows,
  personalJobTotals,
  personalJobsInRange,
  toPersonalJobView,
  workedMinutes,
} from "@/lib/personalJobs";
import type { PersonalJobRecord, PersonalJobView } from "@/lib/personalJobs";
import { LABEL_HINT, MAX_PERSONAL_JOBS, parsePersonalJob } from "@/lib/validation/personalJob";
import type { PersonalJobInput } from "@/lib/validation/personalJob";

const record = (over: Partial<PersonalJobRecord> = {}): PersonalJobRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: null,
  setting: null,
  startsAt: new Date("2026-12-07T17:00:00.000Z"),
  endsAt: new Date("2026-12-07T19:30:00.000Z"),
  timeZone: "America/Los_Angeles",
  breakMinutes: 30,
  miles: null,
  roundTrip: false,
  countedMiles: null,
  ...over,
});
const view = (over: Partial<PersonalJobRecord> = {}): PersonalJobView => toPersonalJobView(record(over));

describe("hours and miles", () => {
  it("worked time is the window less the break, never negative", () => {
    assert.equal(workedMinutes("2026-12-07T17:00:00Z", "2026-12-07T19:30:00Z", 30), 120);
    assert.equal(workedMinutes("2026-12-07T17:00:00Z", "2026-12-07T19:30:00Z", 0), 150);
    assert.equal(workedMinutes("2026-12-07T17:00:00Z", "2026-12-07T17:30:00Z", 90), 0);
    assert.equal(workedMinutes("not a date", "2026-12-07T17:30:00Z", 0), 0);
  });

  it("miles count double for a round trip, to one decimal, and nothing when none were entered", () => {
    assert.equal(countedMiles(12.5, false), 12.5);
    assert.equal(countedMiles(12.5, true), 25);
    assert.equal(countedMiles(0.1, true), 0.2);
    assert.equal(countedMiles(null, true), null);
  });

  it("a stored job becomes the view the browser gets: text numbers turned into numbers, blanks into empty text", () => {
    const v = view({ label: "Clinic", setting: "Medical", miles: "12.5", roundTrip: true, countedMiles: "25.0" });
    assert.deepEqual(v, {
      id: "11111111-1111-4111-8111-111111111111", label: "Clinic", setting: "Medical",
      startsAt: "2026-12-07T17:00:00.000Z", endsAt: "2026-12-07T19:30:00.000Z", timeZone: "America/Los_Angeles",
      breakMinutes: 30, miles: 12.5, roundTrip: true, countedMiles: 25, workedMinutes: 120,
    });
    const bare = view();
    assert.equal(bare.label, "");
    assert.equal(bare.setting, "");
    assert.equal(bare.miles, null);
    assert.equal(bare.countedMiles, null);
    assert.equal(view({ miles: "10.0", roundTrip: true, countedMiles: null }).countedMiles, 20, "worked out when the server's figure is absent");
  });
});

describe("ranges and totals", () => {
  const NOW = Date.parse("2026-12-07T12:00:00Z");
  const day = (n: number) => new Date(NOW - n * 86_400_000);
  const jobs = [
    view({ id: "a", startsAt: day(5), endsAt: new Date(day(5).getTime() + 3_600_000), breakMinutes: 0, miles: "10.0", roundTrip: true, countedMiles: "20.0" }),
    view({ id: "b", startsAt: day(45), endsAt: new Date(day(45).getTime() + 7_200_000), breakMinutes: 30, miles: "5.5", roundTrip: false, countedMiles: "5.5" }),
    view({ id: "c", startsAt: day(200), endsAt: new Date(day(200).getTime() + 1_800_000), breakMinutes: 0 }),
  ];

  it("keeps the jobs that started within the range, newest first", () => {
    assert.deepEqual(personalJobsInRange(jobs, "30", NOW).map((j) => j.id), ["a"]);
    assert.deepEqual(personalJobsInRange(jobs, "90", NOW).map((j) => j.id), ["a", "b"]);
    assert.deepEqual(personalJobsInRange(jobs, "all", NOW).map((j) => j.id), ["a", "b", "c"]);
  });

  it("totals jobs, worked hours and counted miles", () => {
    assert.deepEqual(personalJobTotals(jobs), { jobs: 3, workedMinutes: 60 + 90 + 30, hours: 3, miles: 25.5 });
    assert.deepEqual(personalJobTotals([]), { jobs: 0, workedMinutes: 0, hours: 0, miles: 0 });
    assert.equal(personalJobTotals([view({ breakMinutes: 0, startsAt: new Date("2026-12-07T17:00:00Z"), endsAt: new Date("2026-12-07T17:20:00Z") })]).hours, 0.33);
  });
});

describe("the CSV rows", () => {
  it("have a header, then one row per job oldest first, in each job's own zone, with no rates or earnings", () => {
    const rows = personalJobCsvRows([
      view({ id: "late", startsAt: new Date("2026-12-09T17:00:00Z"), endsAt: new Date("2026-12-09T18:00:00Z"), breakMinutes: 0 }),
      view({ label: "Clinic", setting: "Medical", miles: "12.5", roundTrip: true, countedMiles: "25.0" }),
    ]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ["2026-12-07", "09:00", "2026-12-07", "11:30", "America/Los_Angeles", "Medical", "Clinic", "30", "2.00", "12.5", "Yes", "25.0"]);
    assert.deepEqual(rows[1].slice(0, 4), ["2026-12-09", "09:00", "2026-12-09", "10:00"]);
    assert.equal(rows[1][9], "", "no miles entered");
    assert.equal(rows[1][10], "No");
    assert.equal(rows[0].length, PERSONAL_JOB_CSV_HEADER.length);
    assert.ok(!PERSONAL_JOB_CSV_HEADER.some((h) => /rate|earn|pay|amount|\$/i.test(h)));
  });

  it("show a job in the zone it was entered in, not the viewer's", () => {
    const [row] = personalJobCsvRows([view({ timeZone: "America/New_York" })]);
    assert.deepEqual(row.slice(0, 4), ["2026-12-07", "12:00", "2026-12-07", "14:30"]);
  });
});

describe("parsePersonalJob", () => {
  const valid: PersonalJobInput = {
    label: "  Clinic visit  ", setting: "Medical", startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "11:30",
    timeZone: "America/Los_Angeles", breakMinutes: "30", miles: "12.5", roundTrip: true,
  };
  const fields = (input: Record<string, unknown>) => {
    const r = parsePersonalJob({ ...valid, ...input });
    assert.equal(r.ok, false);
    return r.ok ? {} : r.fieldErrors;
  };

  it("turns the wall-clock times in the entered zone into UTC, and works out the miles", () => {
    const r = parsePersonalJob(valid);
    assert.ok(r.ok);
    assert.equal(r.data.startsAt.toISOString(), "2026-12-07T17:00:00.000Z");
    assert.equal(r.data.endsAt.toISOString(), "2026-12-07T19:30:00.000Z");
    assert.deepEqual({ ...r.data, startsAt: 0, endsAt: 0 }, {
      label: "Clinic visit", setting: "Medical", startsAt: 0, endsAt: 0, timeZone: "America/Los_Angeles",
      breakMinutes: 30, miles: 12.5, roundTrip: true, countedMiles: 25,
    });
  });

  it("follows daylight saving: the same wall-clock hour is a different UTC hour in summer", () => {
    const r = parsePersonalJob({ ...valid, startDate: "2026-07-07", endDate: "2026-07-07" });
    assert.ok(r.ok);
    assert.equal(r.data.startsAt.toISOString(), "2026-07-07T16:00:00.000Z");
  });

  it("treats the optional fields as optional: none given means null", () => {
    const r = parsePersonalJob({ startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "10:00" });
    assert.ok(r.ok);
    assert.deepEqual({ label: r.data.label, setting: r.data.setting, breakMinutes: r.data.breakMinutes, miles: r.data.miles, roundTrip: r.data.roundTrip, countedMiles: r.data.countedMiles, timeZone: r.data.timeZone },
      { label: null, setting: null, breakMinutes: 0, miles: null, roundTrip: false, countedMiles: null, timeZone: "America/Los_Angeles" });
  });

  it("accepts a job over midnight, and exactly 24 hours, but not more", () => {
    assert.ok(parsePersonalJob({ ...valid, startTime: "22:00", endDate: "2026-12-08", endTime: "01:00" }).ok);
    assert.ok(parsePersonalJob({ ...valid, startTime: "09:00", endDate: "2026-12-08", endTime: "09:00" }).ok);
    assert.match(fields({ endDate: "2026-12-08", endTime: "09:30" }).endTime ?? "", /24 hours/);
  });

  it("refuses an end that is not after the start, and a break that is not shorter than the job", () => {
    assert.match(fields({ endTime: "09:00" }).endTime ?? "", /after the start/);
    assert.match(fields({ endTime: "08:00" }).endTime ?? "", /after the start/);
    assert.match(fields({ breakMinutes: "150" }).breakMinutes ?? "", /shorter/);
    assert.ok(parsePersonalJob({ ...valid, breakMinutes: "149" }).ok);
    assert.match(fields({ breakMinutes: "481" }).breakMinutes ?? "", /480|shorter/);
    assert.match(fields({ breakMinutes: "-5" }).breakMinutes ?? "", /whole minutes/);
    assert.match(fields({ breakMinutes: "1.5" }).breakMinutes ?? "", /whole minutes/);
  });

  it("checks dates, times, label, setting and miles", () => {
    assert.match(fields({ startDate: "2026-02-30" }).startDate ?? "", /valid start date/);
    assert.match(fields({ startDate: "12/07/2026" }).startDate ?? "", /valid start date/);
    assert.match(fields({ startTime: "9:00" }).startTime ?? "", /valid start time/);
    assert.match(fields({ endTime: "24:00" }).endTime ?? "", /valid end time/);
    assert.match(fields({ label: "x".repeat(81) }).label ?? "", /80/);
    assert.ok(parsePersonalJob({ ...valid, label: "x".repeat(80) }).ok);
    assert.match(fields({ setting: "Astronaut" }).setting ?? "", /from the list/);
    for (const setting of ["Education", "Social Services", "Employment", "General", ""]) assert.ok(parsePersonalJob({ ...valid, setting }).ok, setting);
    assert.match(fields({ miles: "abc" }).miles ?? "", /number/);
    assert.match(fields({ miles: "-3" }).miles ?? "", /number/);
    assert.match(fields({ miles: "12.345" }).miles ?? "", /number/);
    assert.match(fields({ miles: "2000.5" }).miles ?? "", /2000/);
    const r = parsePersonalJob({ ...valid, miles: "12.34", roundTrip: false });
    assert.ok(r.ok);
    assert.equal(r.data.miles, 12.3);
  });

  it("falls back to Pacific for a time zone it does not know, and ignores fields it does not own", () => {
    const r = parsePersonalJob({ ...valid, timeZone: "Mars/Olympus", interpreterId: "someone-else", id: "x" });
    assert.ok(r.ok);
    assert.equal(r.data.timeZone, "America/Los_Angeles");
    assert.ok(!("interpreterId" in r.data));
  });

  it("never throws for junk, and says so field by field", () => {
    for (const junk of [null, undefined, 5, "text", [], {}]) {
      const r = parsePersonalJob(junk);
      assert.equal(r.ok, false);
    }
    assert.ok(Object.keys(fields({ startDate: undefined, endDate: undefined })).length > 0);
  });

  it("has the cap and the label hint the screens use, with no em-dash in any message", () => {
    assert.equal(MAX_PERSONAL_JOBS, 2000);
    assert.equal(LABEL_HINT, "No client names");
    const messages = [
      ...Object.values(fields({ startDate: "x", startTime: "x", endDate: "x", endTime: "x", label: "x".repeat(99), setting: "x", breakMinutes: "x", miles: "x", timeZone: "" })),
      ...Object.values(fields({ endTime: "09:00" })), ...Object.values(fields({ breakMinutes: "999" })), ...Object.values(fields({ endDate: "2026-12-09" })),
    ];
    for (const m of messages) assert.ok(!m.includes(String.fromCharCode(0x2014)), m);
  });
});
