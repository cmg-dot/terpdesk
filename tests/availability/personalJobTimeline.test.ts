import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agency, install, interpreter, reset, state } from "./harness";

/**
 * Where an agency can see a personal job: only as unlabelled "unavailable" time, and only for interpreters who share their availability.
 * The label and the setting are private to the interpreter, so they must not even be READ by anything an agency sees.
 */

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const OTHER = "9b9b9b9b-d765-42b3-a89a-9ff24274f999";
const PERSONAL = "interpreter_personal_jobs";
const SECRET_LABEL = "Mrs Alvarez knee surgery";
const SECRET_SETTING = "Medical";
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
const pgError = (code: string): Error => Object.assign(new Error("relation problem"), { code });

interface Window { interpreterId: string; startsAt: Date; endsAt: Date }
interface OwnBlock { id: string; label: string; setting: string; startsAt: string; endsAt: string; timeZone: string }
let windowsFor: (ids: readonly string[], from: Date, to: Date) => Promise<Window[]>;
let ownFor: (ids: readonly string[]) => Promise<OwnBlock[]>;
let dayView: (input: { date: string }) => Promise<{ success: boolean; error?: string; view?: { busy: { interpreterId: string; startsAt: string; endsAt: string }[]; interpreters: { id: string; sharesAvailability: boolean }[] } }>;
let availabilityView: (id: string) => Promise<{ personalJobs: OwnBlock[]; busyBlocks: unknown[] }>;

before(async () => {
  await install();
  const blocks = (await import("@/lib/availability/personalJobBlocks")) as { personalJobWindowsFor: typeof windowsFor; ownPersonalJobsFor: typeof ownFor };
  windowsFor = blocks.personalJobWindowsFor;
  ownFor = blocks.ownPersonalJobsFor;
  dayView = (await import("@/app/actions/getInterpreterDayView") as unknown as { getInterpreterDayView: typeof dayView }).getInterpreterDayView;
  availabilityView = (await import("@/app/actions/availabilityView") as unknown as { td_availability_view: typeof availabilityView }).td_availability_view;
});
beforeEach(reset);

describe("what an agency can read of a personal job", () => {
  it("personalJobWindowsFor selects only who and when, never the label or the setting", async () => {
    state.rows[PERSONAL] = [{ interpreterId: ME, startsAt: new Date("2099-01-05T17:00:00Z"), endsAt: new Date("2099-01-05T18:00:00Z") }];
    const result = await windowsFor([ME], new Date("2099-01-05T00:00:00Z"), new Date("2099-01-06T00:00:00Z"));
    assert.equal(result.length, 1);
    assert.deepEqual(state.selects.filter((s) => s.table === PERSONAL), [{ table: PERSONAL, fields: ["interpreterId", "startsAt", "endsAt"] }]);
  });

  it("skips mock ids (the column is a UUID), asks only about the ids it was given, and treats a missing table as none", async () => {
    assert.deepEqual(await windowsFor(["terp-1", "terp-new"], new Date(0), new Date(1)), []);
    assert.ok(!state.ops.includes(`select:${PERSONAL}`));
    state.errors[PERSONAL] = pgError("42P01");
    assert.deepEqual(await windowsFor([ME, OTHER], new Date(0), new Date(1)), []);
  });

  it("any other failure is thrown, so a screen shows its own error instead of a timeline that claims the interpreter is free", async () => {
    state.errors[PERSONAL] = new Error("boom");
    await assert.rejects(() => windowsFor([ME], new Date(0), new Date(1)), /boom/);
  });
});

describe("the agency Interpreter View timeline", () => {
  const date = "2099-01-05";
  const job = (interpreterId: string, a: string, b: string) => ({ interpreterId, startsAt: new Date(`2099-01-05T${a}:00Z`), endsAt: new Date(`2099-01-05T${b}:00Z`), label: SECRET_LABEL, setting: SECRET_SETTING });

  it("draws a sharing interpreter's personal job as unavailable time, merged with their busy time, with no label anywhere in the answer", async () => {
    state.session = agency();
    state.rows.availability_shares = [{ interpreterId: ME }];
    state.rows.busy_blocks = [{ interpreterId: ME, startsAt: new Date("2099-01-05T16:30:00Z"), endsAt: new Date("2099-01-05T17:30:00Z"), title: "Dentist" }];
    state.rows[PERSONAL] = [job(ME, "17:00", "19:00")];
    const result = await dayView({ date });
    assert.ok(result.success, result.error);
    assert.deepEqual(result.view?.busy, [{ interpreterId: ME, startsAt: "2099-01-05T16:30:00.000Z", endsAt: "2099-01-05T19:00:00.000Z" }], "one merged band: nothing says which part was which");
    const text = JSON.stringify(result);
    for (const secret of [SECRET_LABEL, "Alvarez", SECRET_SETTING, "Dentist", "Personal job"]) assert.ok(!text.includes(secret), `${secret} must not reach the agency`);
  });

  it("asks only about interpreters who share with the agency, and selects nothing but who and when", async () => {
    state.session = agency();
    state.rows.availability_shares = [{ interpreterId: ME }];
    await dayView({ date });
    const personalSelects = state.selects.filter((s) => s.table === PERSONAL);
    assert.deepEqual(personalSelects, [{ table: PERSONAL, fields: ["interpreterId", "startsAt", "endsAt"] }]);
  });

  it("still answers when the personal jobs table does not exist yet", async () => {
    state.session = agency();
    state.rows.availability_shares = [{ interpreterId: ME }];
    state.errors[PERSONAL] = pgError("42P01");
    const result = await dayView({ date });
    assert.ok(result.success, result.error);
    assert.deepEqual(result.view?.busy, []);
  });

  it("is for agency staff only", async () => {
    state.session = interpreter(ME);
    const result = await dayView({ date });
    assert.equal(result.success, false);
    assert.deepEqual(state.selects.filter((s) => s.table === PERSONAL), []);
  });

  it("the timeline says Unavailable, in the band, the legend and the row caption, and never Busy", () => {
    const block = read("src", "components", "calendar", "TimelineBusyBlock.tsx");
    assert.match(block, /aria-label="Unavailable"/);
    assert.match(block, /<span className="truncate">Unavailable<\/span>/);
    assert.ok(!/>Busy</.test(block) && !/aria-label="Busy"/.test(block));
    assert.match(read("src", "components", "calendar", "TimelineGrid.tsx"), /Unavailable part of the day/);
    assert.match(read("src", "components", "calendar", "InterpreterTimeline.tsx"), /Unavailable \(time the interpreter shares\)/);
  });

  it("the agency's interpreter detail page counts personal jobs as not free, through the same bare-window read", () => {
    const source = read("src", "lib", "agencyInterpreterView.ts");
    assert.match(source, /personalJobWindowsFor\(ids, now, windowEnd\)/);
    assert.match(source, /if \(sharesAvailability\) \{[\s\S]*personalJobWindowsFor/, "only for interpreters who share");
    assert.ok(!source.includes("ownPersonalJobsFor"), "never the reader that returns the label");
  });
});

describe("the interpreter's own calendar data", () => {
  it("td_availability_view returns the interpreter's own personal jobs, with their label (it is their data), and nothing for another interpreter", async () => {
    state.session = interpreter(ME);
    state.rows[PERSONAL] = [{ id: "p1", label: SECRET_LABEL, setting: SECRET_SETTING, startsAt: new Date("2099-01-05T17:00:00Z"), endsAt: new Date("2099-01-05T18:00:00Z"), timeZone: "America/Los_Angeles" }];
    const view = await availabilityView(ME);
    assert.deepEqual(view.personalJobs, [{ id: "p1", label: SECRET_LABEL, setting: SECRET_SETTING, startsAt: "2099-01-05T17:00:00.000Z", endsAt: "2099-01-05T18:00:00.000Z", timeZone: "America/Los_Angeles" }]);
    await assert.rejects(() => availabilityView(OTHER), /Forbidden/);
  });

  it("returns an empty list when there are none or the table is missing, and fails like the rest of the view on any other error", async () => {
    state.session = interpreter(ME);
    assert.deepEqual((await availabilityView(ME)).personalJobs, []);
    state.errors[PERSONAL] = pgError("42P01");
    assert.deepEqual((await availabilityView(ME)).personalJobs, []);
    state.errors[PERSONAL] = new Error("boom");
    await assert.rejects(() => availabilityView(ME), /boom/);
  });

  it("ownPersonalJobsFor skips mock ids and gives empty text for a missing label", async () => {
    assert.deepEqual(await ownFor(["terp-1"]), []);
    state.rows[PERSONAL] = [{ id: "p2", label: null, setting: null, startsAt: new Date("2099-01-05T17:00:00Z"), endsAt: new Date("2099-01-05T18:00:00Z"), timeZone: "America/Denver" }];
    const [only] = await ownFor([ME]);
    assert.equal(only.label, "");
    assert.equal(only.setting, "");
  });
});
