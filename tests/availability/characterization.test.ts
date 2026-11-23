import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, reset, state } from "./harness";

/**
 * Characterization of the availability code. These assertions were written against the original single file (app/actions/availability.ts,
 * 959 lines) and passed unchanged after it was split into lib/availability/* and focused actions, so the split changed no behaviour.
 */

type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;
type FitStatus = "available" | "unavailable" | "outside_hours" | "not_provided" | "not_shared";
interface Conflict { hasConflict: boolean; reason?: "job" | "busy" }
interface FitParams { interpreterId: string; jobStartsAtUtc: string; jobEndsAtUtc: string; jobTimeZone?: string; excludeRequestId?: string }

let tdConflict: Fn<[{ interpreterId: string; startsAtUtc: string | Date; endsAtUtc: string | Date; excludeRequestId?: string }], Conflict>;
let checkFit: Fn<[FitParams], { fit: FitStatus }>;
let fitForJob: Fn<[{ interpreterIds: string[]; jobStartsAtUtc: string; jobEndsAtUtc: string; excludeRequestId?: string }], Record<string, FitStatus>>;
let resolveIds: Fn<[string], string[]>;
let ensureTables: Fn<[], void>;
let availabilityView: Fn<[string], { profile: Record<string, unknown>; rules: unknown[]; exceptions: Record<string, unknown>[]; busyBlocks: Record<string, unknown>[]; shares: unknown[] }>;
let saveBusy: Fn<[Record<string, unknown>], Record<string, unknown>>;
let deleteBusy: Fn<[string], { success: boolean }>;
let saveAvailability: Fn<[Record<string, unknown>], { success: boolean }>;
let updateZone: Fn<[{ interpreterId: string; timeZone: string }], { success: boolean; timeZone: string }>;
let toggleShare: Fn<[{ interpreterId: string; agencyId: string; enabled: boolean }], { success: boolean; enabled: boolean }>;

const load = async (spec: string): Promise<Record<string, unknown>> => (await import(spec)) as Record<string, unknown>;
const pick = <T>(mod: Record<string, unknown>, name: string): T => {
  const fn = mod[name];
  if (typeof fn !== "function") throw new Error(`${name} is not exported where expected`);
  return fn as T;
};

before(async () => {
  await install();
  tdConflict = pick(await load("@/lib/availability/conflict"), "td_conflict");
  resolveIds = pick(await load("@/lib/availability/ids"), "resolveInterpreterIds");
  ensureTables = pick(await load("@/lib/availability/ensureTables"), "ensureAvailabilityTables");
  const fit = await load("@/app/actions/interpreterFit");
  checkFit = pick(fit, "checkInterpreterFit");
  fitForJob = pick(fit, "getInterpretersFitForJob");
  availabilityView = pick(await load("@/app/actions/availabilityView"), "td_availability_view");
  toggleShare = pick(await load("@/app/actions/availabilityView"), "td_toggle_share");
  const busy = await load("@/app/actions/busyBlocks");
  saveBusy = pick(busy, "td_save_busy");
  deleteBusy = pick(busy, "td_delete_busy");
  const rules = await load("@/app/actions/availabilityRules");
  saveAvailability = pick(rules, "td_save_availability");
  updateZone = pick(rules, "td_update_interpreter_timezone");
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const REQ_A = "6908c616-3ea4-477d-ad5c-b0b0cdf643b3";
const REQ_B = "7a08c616-3ea4-477d-ad5c-b0b0cdf643b4";
// Monday 2026-12-07, 9:00 to 10:00 in Pacific time.
const START = "2026-12-07T17:00:00.000Z";
const END = "2026-12-07T18:00:00.000Z";
const accepted = (requestId: string, startsAt: string, endsAt: string, status = "booked") => ({ offerId: `offer-${requestId}`, requestId, reqStatus: status, reqData: { startsAt, endsAt }, reqCreatedAt: new Date(startsAt) });
const conflictParams = { interpreterId: ME, startsAtUtc: START, endsAtUtc: END };

describe("td_conflict", () => {
  it("says no conflict when the interpreter has no booking and no busy time", async () => {
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: false });
    assert.deepEqual(state.ops, ["select:interpreters", "select:offers", "select:busy_blocks"]);
  });

  it("finds an accepted booking that overlaps, as a job conflict", async () => {
    state.rows.offers = [accepted(REQ_A, "2026-12-07T17:30:00.000Z", "2026-12-07T18:30:00.000Z")];
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: true, reason: "job" });
  });

  it("treats bookings that only touch the window as no conflict, and one minute of overlap as a conflict", async () => {
    state.rows.offers = [accepted(REQ_A, "2026-12-07T16:00:00.000Z", START), accepted(REQ_B, END, "2026-12-07T19:00:00.000Z")];
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: false });
    state.rows.offers = [accepted(REQ_A, "2026-12-07T16:00:00.000Z", "2026-12-07T17:01:00.000Z")];
    assert.equal((await tdConflict(conflictParams)).hasConflict, true);
    state.rows.offers = [accepted(REQ_A, "2026-12-07T17:59:00.000Z", "2026-12-07T19:00:00.000Z")];
    assert.equal((await tdConflict(conflictParams)).hasConflict, true);
  });

  it("ignores a cancelled booking, and the job being staffed", async () => {
    state.rows.offers = [accepted(REQ_A, START, END, "cancelled"), accepted(REQ_B, START, END, "canceled")];
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: false });
    state.rows.offers = [accepted(REQ_A, START, END)];
    assert.deepEqual(await tdConflict({ ...conflictParams, excludeRequestId: REQ_A }), { hasConflict: false });
    assert.deepEqual(await tdConflict({ ...conflictParams, excludeRequestId: REQ_B }), { hasConflict: true, reason: "job" });
  });

  it("finds private busy time as a busy conflict, after the bookings are checked", async () => {
    state.rows.busy_blocks = [{ id: "b1" }];
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: true, reason: "busy" });
  });

  it("does not ask the offers table about an id that is not a UUID, but still checks busy time", async () => {
    assert.deepEqual(await tdConflict({ ...conflictParams, interpreterId: "terp-new" }), { hasConflict: false });
    assert.ok(!state.ops.includes("select:offers"));
    assert.ok(state.ops.includes("select:busy_blocks"));
  });

  it("fails closed: any read that throws counts as a conflict", async () => {
    state.failAlways.add("busy_blocks");
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: true, reason: "job" });
    reset();
    state.failAlways.add("offers");
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: true, reason: "job" });
  });

  it("is callable without any session (it is a plain lookup the server code calls)", async () => {
    state.session = null;
    assert.deepEqual(await tdConflict(conflictParams), { hasConflict: false });
  });
});

describe("resolveInterpreterIds and ensureAvailabilityTables", () => {
  it("returns the id itself, plus the mock id for the demo interpreter's email, and never throws", async () => {
    assert.deepEqual(await resolveIds(ME), [ME]);
    state.rows.interpreters = [{ id: ME, email: "dale.fictional@example.com" }];
    assert.deepEqual(await resolveIds(ME), [ME, "terp-1"]);
    reset();
    state.rows.interpreters = [{ id: ME }];
    assert.deepEqual(await resolveIds("terp-1"), ["terp-1", ME]);
    reset();
    state.failAlways.add("interpreters");
    assert.deepEqual(await resolveIds(ME), [ME]);
  });

  it("does nothing, and touches no table, unless TERPDESK_RUNTIME_DDL=1", async () => {
    await ensureTables();
    assert.deepEqual(state.ops, []);
  });
});

describe("checkInterpreterFit", () => {
  const params: FitParams = { interpreterId: ME, jobStartsAtUtc: START, jobEndsAtUtc: END };
  const shared = [{ enabled: true }];
  const rule = (startMinute: number, endMinute: number) => ({ id: "r", interpreterId: ME, weekday: 1, startMinute, endMinute });

  it("is for agency staff only", async () => {
    await assert.rejects(() => checkFit(params), /Unauthorized/);
    state.session = interpreter(ME);
    await assert.rejects(() => checkFit(params), /Forbidden/);
  });

  it("says unavailable for a booking or busy time, before anything about sharing", async () => {
    state.session = agency();
    state.rows.offers = [accepted(REQ_A, START, END)];
    assert.deepEqual(await checkFit(params), { fit: "unavailable" });
    assert.ok(!state.ops.includes("select:availability_shares"), "the sharing tier is never reached");
    reset();
    state.session = agency();
    state.rows.busy_blocks = [{ id: "b" }];
    assert.deepEqual(await checkFit(params), { fit: "unavailable" });
  });

  it("does not count the job's own booking against it", async () => {
    state.session = agency();
    state.rows.offers = [accepted(REQ_A, START, END)];
    assert.deepEqual(await checkFit({ ...params, excludeRequestId: REQ_A }), { fit: "not_shared" });
    assert.deepEqual(await checkFit({ ...params, excludeRequestId: "not-an-id" }), { fit: "unavailable" }, "anything that is not a request id is ignored");
  });

  it("says not_shared unless sharing is switched on", async () => {
    state.session = agency();
    assert.deepEqual(await checkFit(params), { fit: "not_shared" });
    state.rows.availability_shares = [{ enabled: false }];
    assert.deepEqual(await checkFit(params), { fit: "not_shared" });
  });

  it("says not_provided when shared but no hours are set for that weekday", async () => {
    state.session = agency();
    state.rows.availability_shares = shared;
    assert.deepEqual(await checkFit(params), { fit: "not_provided" });
  });

  it("compares the job with the weekly hours in the interpreter's own zone", async () => {
    state.session = agency();
    state.rows.availability_shares = shared;
    state.rows.interpreter_profiles = [{ timeZone: "America/Los_Angeles" }];
    state.rows.availability_rules = [rule(540, 1020)];
    assert.deepEqual(await checkFit(params), { fit: "available" });
    state.rows.availability_rules = [rule(600, 1020)];
    assert.deepEqual(await checkFit(params), { fit: "outside_hours" });
    state.rows.availability_rules = [rule(540, 570)];
    assert.deepEqual(await checkFit(params), { fit: "outside_hours" }, "a rule must cover the whole job");
    state.rows.availability_rules = [rule(540, 660)];
    assert.deepEqual(await checkFit(params), { fit: "available" }, "9:00 to 11:00 covers a 9:00 job in Pacific time");
    state.rows.interpreter_profiles = [{ timeZone: "America/New_York" }];
    assert.deepEqual(await checkFit(params), { fit: "outside_hours" }, "the same job is 12:00 in New York, outside a 9:00 to 11:00 rule");
  });

  it("uses the job's zone only when the interpreter has no profile zone, and Pacific when neither", async () => {
    state.session = agency();
    state.rows.availability_shares = shared;
    state.rows.availability_rules = [rule(540, 1020)];
    assert.deepEqual(await checkFit(params), { fit: "available" });
    assert.deepEqual(await checkFit({ ...params, jobTimeZone: "America/Chicago" }), { fit: "available" });
    state.rows.availability_rules = [rule(0, 480)];
    assert.deepEqual(await checkFit({ ...params, jobTimeZone: "America/Chicago" }), { fit: "outside_hours" });
  });

  it("lets a dated exception override the weekly hours: closed, a window that covers the job, a window that does not, or open all day", async () => {
    state.session = agency();
    state.rows.availability_shares = shared;
    state.rows.availability_rules = [rule(540, 1020)];
    state.rows.availability_exceptions = [{ available: false }];
    assert.deepEqual(await checkFit(params), { fit: "outside_hours" });
    state.rows.availability_exceptions = [{ available: true, startMinute: 540, endMinute: 600 }];
    assert.deepEqual(await checkFit(params), { fit: "available" });
    state.rows.availability_exceptions = [{ available: true, startMinute: 600, endMinute: 660 }];
    assert.deepEqual(await checkFit(params), { fit: "outside_hours" });
    state.rows.availability_exceptions = [{ available: true }];
    assert.deepEqual(await checkFit(params), { fit: "available" });
  });

  it("counts a job that runs past midnight against the day's end", async () => {
    state.session = agency();
    state.rows.availability_shares = shared;
    state.rows.availability_rules = [rule(0, 1440)];
    // 11:30 PM to 1:00 AM Pacific, starting on Monday evening: a rule that ends at midnight does not cover it.
    const late = { ...params, jobStartsAtUtc: "2026-12-08T07:30:00.000Z", jobEndsAtUtc: "2026-12-08T09:00:00.000Z" };
    assert.deepEqual(await checkFit(late), { fit: "outside_hours" });
  });
});

describe("getInterpretersFitForJob", () => {
  const base = { jobStartsAtUtc: START, jobEndsAtUtc: END };

  it("is for agency staff only", async () => {
    await assert.rejects(() => fitForJob({ interpreterIds: [ME], ...base }), /Unauthorized/);
    state.session = interpreter(ME);
    await assert.rejects(() => fitForJob({ interpreterIds: [ME], ...base }), /Forbidden/);
  });

  it("answers one status per interpreter id, in the ids it was given", async () => {
    state.session = agency();
    state.rows.availability_shares = [{ enabled: true }];
    state.rows.availability_rules = [{ id: "r", interpreterId: ME, weekday: 1, startMinute: 540, endMinute: 1020 }];
    assert.deepEqual(await fitForJob({ interpreterIds: [ME, "terp-new"], ...base }), { [ME]: "available", "terp-new": "available" });
    assert.deepEqual(await fitForJob({ interpreterIds: [], ...base }), {});
  });

  it("shows an interpreter whose check fails as unavailable, and still answers the others", async () => {
    state.session = agency();
    state.rows.availability_shares = [{ enabled: true }];
    state.failOnce.add("availability_shares");
    const result = await fitForJob({ interpreterIds: [ME, "terp-new"], ...base });
    assert.equal(result[ME], "unavailable");
    assert.equal(result["terp-new"], "not_provided");
  });
});

describe("td_availability_view", () => {
  const blockRow = { id: "b1", title: "Dentist", startsAt: new Date(START), endsAt: new Date(END), timeZone: null, revision: 3 };

  it("is the signed-in interpreter's own", async () => {
    await assert.rejects(() => availabilityView(ME), /Unauthorized/);
    state.session = agency();
    await assert.rejects(() => availabilityView(ME), /Forbidden/);
    state.session = interpreter(ME);
    await assert.rejects(() => availabilityView("someone-else"), /Forbidden/);
  });

  it("returns the default zone when none is saved, and only the profile fields the interpreter's browser may have", async () => {
    state.session = interpreter(ME);
    const empty = await availabilityView(ME);
    assert.equal(empty.profile.timeZone, "America/Los_Angeles");
    assert.equal(empty.profile.id, "default");
    state.rows.interpreter_profiles = [{ id: "p1", interpreterId: ME, timeZone: "America/Denver", updatedAt: new Date(0), stateRate: "55.00", nonStateRate: "60.00", certification: "NIC" }];
    const view = await availabilityView(ME);
    assert.deepEqual(Object.keys(view.profile).sort(), ["id", "interpreterId", "timeZone", "updatedAt"]);
    assert.ok(!JSON.stringify(view).includes("55.00") && !JSON.stringify(view).includes("NIC"), "the agency-only rate card and certification are never sent");
  });

  it("returns busy blocks as ISO times with the default zone, and exceptions with their date", async () => {
    state.session = interpreter(ME);
    state.rows.busy_blocks = [blockRow];
    state.rows.availability_exceptions = [{ id: "e1", onDate: "2026-12-07", available: true, startMinute: null, endMinute: 600 }];
    const view = await availabilityView(ME);
    assert.deepEqual(view.busyBlocks, [{ id: "b1", title: "Dentist", startsAt: START, endsAt: END, timeZone: "America/Los_Angeles", revision: 3 }]);
    assert.deepEqual(view.exceptions, [{ id: "e1", date: "2026-12-07", available: true, startMinute: undefined, endMinute: 600 }]);
  });
});

describe("busy blocks", () => {
  it("td_save_busy turns the wall-clock time in the chosen zone into UTC and inserts one block under the primary id", async () => {
    state.session = interpreter(ME);
    const saved = await saveBusy({ interpreterId: ME, title: "Dentist", startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "10:30", timeZone: "America/Los_Angeles" });
    assert.equal(saved.startsAt, "2026-12-07T17:00:00.000Z");
    assert.equal(saved.endsAt, "2026-12-07T18:30:00.000Z");
    assert.equal(saved.interpreterId, ME);
    assert.equal(saved.title, "Dentist");
    assert.deepEqual(state.ops.filter((o) => o.startsWith("insert") || o.startsWith("update")), ["insert:busy_blocks"]);
  });

  it("td_save_busy covers whole days for an all-day block: midnight to midnight after the last day", async () => {
    state.session = interpreter(ME);
    const saved = await saveBusy({ interpreterId: ME, isAllDay: true, startDate: "2026-12-07", endDate: "2026-12-08", timeZone: "America/Los_Angeles" });
    assert.equal(saved.startsAt, "2026-12-07T08:00:00.000Z");
    assert.equal(saved.endsAt, "2026-12-09T08:00:00.000Z");
    assert.equal(saved.title, "Busy");
  });

  it("td_save_busy updates an existing block (revision + 1) instead of inserting, and uses the saved profile zone when none is given", async () => {
    state.session = interpreter(ME);
    state.rows.busy_blocks = [{ id: "b1", revision: 4 }];
    state.rows.interpreter_profiles = [{ timeZone: "America/New_York" }];
    const saved = await saveBusy({ id: "b1", interpreterId: ME, startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "10:00" });
    assert.equal(saved.startsAt, "2026-12-07T14:00:00.000Z");
    assert.equal(saved.timeZone, "America/New_York");
    assert.equal(state.updated.length, 1);
    assert.equal((state.updated[0].set as { revision: number }).revision, 5);
    assert.ok(!state.ops.includes("insert:busy_blocks"));
  });

  it("td_save_busy is the signed-in interpreter's own", async () => {
    await assert.rejects(() => saveBusy({ interpreterId: ME }), /Unauthorized/);
    state.session = interpreter(ME);
    await assert.rejects(() => saveBusy({ interpreterId: "someone-else" }), /Forbidden/);
  });

  it("td_delete_busy deletes the interpreter's own block, refuses another's, and quietly deletes nothing for an unknown id", async () => {
    state.session = interpreter(ME);
    state.rows.busy_blocks = [{ interpreterId: ME }];
    assert.deepEqual(await deleteBusy("b1"), { success: true });
    assert.ok(state.ops.includes("delete:busy_blocks"));
    state.rows.busy_blocks = [{ interpreterId: "someone-else" }];
    await assert.rejects(() => deleteBusy("b2"), /Forbidden/);
    await assert.rejects(async () => { state.session = null; await deleteBusy("b3"); }, /Unauthorized/);
  });
});

describe("weekly hours, time zone and sharing", () => {
  it("td_save_availability replaces the profile zone, the weekly rules and the exceptions, for the interpreter's own ids only", async () => {
    state.session = interpreter(ME);
    const result = await saveAvailability({ interpreterId: ME, timeZone: "America/Denver", rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], exceptions: [{ date: "2026-12-25", available: false }] });
    assert.deepEqual(result, { success: true });
    assert.deepEqual(state.ops.filter((o) => !o.startsWith("select")), ["insert:interpreter_profiles", "delete:availability_rules", "insert:availability_rules", "delete:availability_exceptions", "insert:availability_exceptions"]);
    const zone = state.inserted.find((i) => i.table === "interpreter_profiles");
    assert.equal((zone?.values as { timeZone: string }).timeZone, "America/Denver");
    await assert.rejects(() => { state.session = interpreter("other"); return saveAvailability({ interpreterId: ME, rules: [] }); }, /Forbidden/);
  });

  it("td_save_availability with no rules still clears the old ones", async () => {
    state.session = interpreter(ME);
    await saveAvailability({ interpreterId: ME, rules: [] });
    assert.ok(state.ops.includes("delete:availability_rules") && !state.ops.includes("insert:availability_rules"));
  });

  it("td_update_interpreter_timezone updates an existing profile or inserts one, and answers with the zone it kept", async () => {
    state.session = interpreter(ME);
    assert.deepEqual(await updateZone({ interpreterId: ME, timeZone: "America/Chicago" }), { success: true, timeZone: "America/Chicago" });
    assert.ok(state.ops.includes("insert:interpreter_profiles"));
    reset();
    state.session = interpreter(ME);
    state.rows.interpreter_profiles = [{ id: "p1" }];
    await updateZone({ interpreterId: ME, timeZone: "America/Chicago" });
    assert.ok(state.ops.includes("update:interpreter_profiles") && !state.ops.includes("insert:interpreter_profiles"));
  });

  it("td_toggle_share inserts a share for an agency or updates the existing one", async () => {
    state.session = interpreter(ME);
    assert.deepEqual(await toggleShare({ interpreterId: ME, agencyId: "agency-1", enabled: true }), { success: true, enabled: true });
    assert.deepEqual(state.ops.filter((o) => !o.startsWith("select")), ["insert:availability_shares"]);
    reset();
    state.session = interpreter(ME);
    state.rows.availability_shares = [{ id: "s1" }];
    await toggleShare({ interpreterId: ME, agencyId: "agency-1", enabled: false });
    assert.deepEqual(state.ops.filter((o) => !o.startsWith("select")), ["update:availability_shares"]);
    await assert.rejects(() => { state.session = interpreter("other"); return toggleShare({ interpreterId: ME, agencyId: "agency-1", enabled: true }); }, /Forbidden/);
  });
});
