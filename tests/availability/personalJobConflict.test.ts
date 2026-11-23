import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, renderWhere, reset, state } from "./harness";

/**
 * Personal jobs in the conflict check (B3): the seven cases that decide whether the integration is safe. The database is a stub (see
 * harness.ts); the overlap comparison itself is checked on the SQL the query would send, and again against a real database by
 * the script run for the commit.
 */

type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;
interface Conflict { hasConflict: boolean; reason?: "job" | "busy" }
type FitStatus = "available" | "unavailable" | "outside_hours" | "not_provided" | "not_shared";
interface ConflictParams { interpreterId: string; startsAtUtc: string; endsAtUtc: string; excludeRequestId?: string }

let tdConflict: Fn<[ConflictParams], Conflict>;
let checkFit: Fn<[{ interpreterId: string; jobStartsAtUtc: string; jobEndsAtUtc: string }], { fit: FitStatus }>;
let respond: Fn<[string, "accept", { travel: string }], { success: boolean; error?: string }>;

before(async () => {
  await install();
  tdConflict = (await import("@/lib/availability/conflict") as { td_conflict: typeof tdConflict }).td_conflict;
  checkFit = (await import("@/app/actions/interpreterFit") as { checkInterpreterFit: typeof checkFit }).checkInterpreterFit;
  respond = (await import("@/app/actions/respondToOffer") as { respondToOffer: typeof respond }).respondToOffer;
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const OTHER = "9b9b9b9b-d765-42b3-a89a-9ff24274f999";
const REQ = "6908c616-3ea4-477d-ad5c-b0b0cdf643b3";
const START = "2099-01-05T17:00:00.000Z";
const END = "2099-01-05T18:00:00.000Z";
const params: ConflictParams = { interpreterId: ME, startsAtUtc: START, endsAtUtc: END };
const PERSONAL = "interpreter_personal_jobs";
const SECRET_LABEL = "Mrs Alvarez knee surgery";
const pgError = (code: string): Error => Object.assign(new Error("relation or constraint problem"), { code });

describe("personal jobs in td_conflict", () => {
  it("1. any read failure other than a missing table fails closed (a conflict), whatever its code", async () => {
    for (const error of [new Error("boom"), pgError("23505"), pgError("57P01"), Object.assign(new Error("wrapped"), { cause: { code: "08006" } })]) {
      reset();
      state.errors[PERSONAL] = error;
      assert.deepEqual(await tdConflict(params), { hasConflict: true, reason: "job" });
    }
  });

  it("2. a missing table (42P01, on the error or on its cause) counts as no personal jobs, and the other checks still run", async () => {
    for (const error of [pgError("42P01"), Object.assign(new Error("Failed query"), { cause: { code: "42P01" } })]) {
      reset();
      state.errors[PERSONAL] = error;
      assert.deepEqual(await tdConflict(params), { hasConflict: false }, "nothing else in the way: free");
      assert.deepEqual(state.ops.slice(0, 3), ["select:interpreters", "select:offers", "select:busy_blocks"]);
      assert.ok(state.ops.includes(`select:${PERSONAL}`));
      state.rows.busy_blocks = [{ id: "b" }];
      assert.deepEqual(await tdConflict(params), { hasConflict: true, reason: "busy" }, "busy time still counts");
      state.rows.busy_blocks = [];
      state.rows.offers = [{ offerId: "o", requestId: REQ, reqStatus: "booked", reqData: { startsAt: START, endsAt: END }, reqCreatedAt: new Date(START) }];
      assert.deepEqual(await tdConflict(params), { hasConflict: true, reason: "job" }, "a booking still counts");
    }
  });

  it("3. overlap is strict on both ends: the query asks for starts_at before the window's end and ends_at after its start", async () => {
    await tdConflict(params);
    const sent = state.wheres.find((w) => w.table === PERSONAL);
    assert.ok(sent, "the personal jobs table was queried");
    const { sql, params: bound } = await renderWhere(sent.condition);
    assert.match(sql, /"starts_at" < \$\d+/, "a job starting exactly when the window ends does not overlap");
    assert.match(sql, /"ends_at" > \$\d+/, "a job ending exactly when the window starts does not overlap");
    assert.ok(!/<=|>=/.test(sql), "no inclusive comparison");
    const instants = bound.filter((p) => p instanceof Date || (typeof p === "string" && /^\d{4}-/.test(p))).map((p) => new Date(p as string | Date).toISOString());
    assert.deepEqual(instants, [END, START], "starts_at < window end, ends_at > window start");
  });

  it("4. only the signed-in interpreter's own ids are asked about, never another's", async () => {
    await tdConflict(params);
    const sent = state.wheres.find((w) => w.table === PERSONAL);
    assert.ok(sent);
    const { sql, params: bound } = await renderWhere(sent.condition);
    assert.match(sql, /"interpreter_id" in \(\$1\)/);
    assert.equal(bound[0], ME);
    assert.ok(!bound.includes(OTHER));
    // A mock id that is not a UUID never reaches the table (its column is a UUID).
    reset();
    assert.deepEqual(await tdConflict({ ...params, interpreterId: "terp-new" }), { hasConflict: false });
    assert.ok(!state.ops.includes(`select:${PERSONAL}`));
  });

  it("5. respondToOffer refuses to accept over a personal job, with the existing message, and books nothing", async () => {
    const { db } = await import("@/db");
    const real = (db as unknown as { transaction: unknown }).transaction;
    let reachedTransaction = false;
    (db as unknown as { transaction: unknown }).transaction = async () => { reachedTransaction = true; throw new Error("REACHED_TRANSACTION"); };
    try {
      const setup = () => {
        reset();
        state.session = interpreter(ME);
        state.rows.offers = [{ id: "offer-1", interpreterId: ME, requestId: REQ, status: "pending", expiresAt: new Date("2099-01-01") }];
        state.rows.requests = [{ id: REQ, status: "draft", createdAt: new Date(START), data: { startsAt: START, endsAt: END } }];
      };
      // Control: with no personal job the accept goes on to book (it reaches the transaction).
      setup();
      await assert.rejects(() => respond("offer-1", "accept", { travel: "no" }), /REACHED_TRANSACTION/);
      assert.equal(reachedTransaction, true);
      // With a personal job over the same time: refused before anything is written.
      reachedTransaction = false;
      setup();
      state.rows[PERSONAL] = [{ id: "p1" }];
      assert.deepEqual(await respond("offer-1", "accept", { travel: "no" }), { success: false, error: "You cannot accept this job because it conflicts with your scheduled busy time." });
      assert.equal(reachedTransaction, false);
      assert.ok(!state.ops.some((op) => op.startsWith("update:") || op.startsWith("insert:")));
    } finally {
      (db as unknown as { transaction: unknown }).transaction = real;
    }
  });

  it("6. checkInterpreterFit says unavailable for a personal job, and neither the label nor anything but the id is read", async () => {
    state.session = agency();
    state.rows[PERSONAL] = [{ id: "p1", label: SECRET_LABEL }];
    const result = await checkFit({ interpreterId: ME, jobStartsAtUtc: START, jobEndsAtUtc: END });
    assert.deepEqual(result, { fit: "unavailable" });
    assert.ok(!JSON.stringify(result).includes(SECRET_LABEL));
    assert.deepEqual(state.selects.filter((s) => s.table === PERSONAL), [{ table: PERSONAL, fields: ["id"] }], "only the id is selected");
    assert.ok(!state.ops.includes("select:availability_shares"), "decided before the sharing tier, like any other busy time");
  });

  it("7. with no personal jobs, everything behaves as before: the same answers, and the new read is the last one", async () => {
    assert.deepEqual(await tdConflict(params), { hasConflict: false });
    assert.deepEqual(state.ops, ["select:interpreters", "select:offers", "select:busy_blocks", `select:${PERSONAL}`]);
    state.session = agency();
    assert.deepEqual(await checkFit({ interpreterId: ME, jobStartsAtUtc: START, jobEndsAtUtc: END }), { fit: "not_shared" });
    state.rows.availability_shares = [{ enabled: true }];
    assert.deepEqual(await checkFit({ interpreterId: ME, jobStartsAtUtc: START, jobEndsAtUtc: END }), { fit: "not_provided" });
    state.rows.availability_rules = [{ id: "r", interpreterId: ME, weekday: 1, startMinute: 0, endMinute: 1440 }];
    assert.deepEqual(await checkFit({ interpreterId: ME, jobStartsAtUtc: START, jobEndsAtUtc: END }), { fit: "available" });
  });
});
