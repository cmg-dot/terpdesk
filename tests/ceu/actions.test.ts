import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, renderWhere, reset, state } from "../availability/harness";

type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;
type CycleResult = { success: true; cycle: { id: string; label: string; requiredTotal: number | null } } | { success: false; error: string; fieldErrors?: Record<string, string> };
type EntryResult = { success: true; entry: { id: string; amount: number; unit: string; cycleId: string | null } } | { success: false; error: string; fieldErrors?: Record<string, string> };
type Plain = { success: boolean; error?: string };
type Loaded = { status: string; cycles?: { id: string }[]; entries?: { id: string }[] };

let loadMine: Fn<[], Loaded>;
let saveCycle: Fn<[Record<string, unknown>], CycleResult>;
let deleteCycle: Fn<[string], Plain>;
let saveEntry: Fn<[Record<string, unknown>], EntryResult>;
let deleteEntry: Fn<[string], Plain>;
let GET: (request: Request) => Promise<Response>;

before(async () => {
  await install();
  const actions = (await import("@/app/actions/ceu")) as unknown as {
    loadMyCeu: typeof loadMine; saveCycle: typeof saveCycle; deleteCycle: typeof deleteCycle; saveEntry: typeof saveEntry; deleteEntry: typeof deleteEntry;
  };
  ({ loadMyCeu: loadMine, saveCycle, deleteCycle, saveEntry, deleteEntry } = actions);
  GET = ((await import("@/app/api/profile/ceu/export/route")) as { GET: typeof GET }).GET;
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const CYCLE = "7a08c616-3ea4-477d-ad5c-b0b0cdf643b4";
const ENTRY = "9b1d8e52-5b14-4f7e-8f55-0c9f3a1f6a11";
const CRED = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const CYCLES = "renewal_cycles";
const ENTRIES = "ceu_entries";
const SECRET = "Okafor oncology";
const cycleForm = { label: SECRET, cycleStart: "2024-01-01", cycleEnd: "2026-12-31", unit: "ceu", requiredTotal: "8", requiredEthics: "1", requiredPpo: "" };
const entryForm = { title: SECRET, provider: "Acme", category: "Webinar", earnedOn: "2025-05-01", amount: "0.3", unit: "ceu", cycleId: "", isEthics: false, isPpo: false };
const cycleRow = (over: Record<string, unknown> = {}) => ({
  id: CYCLE, interpreterId: ME, credentialId: null, label: SECRET, cycleStart: "2024-01-01", cycleEnd: "2026-12-31", unit: "ceu",
  requiredTotal: "8.00", requiredEthics: null, requiredPpo: null, createdAt: new Date(0), updatedAt: new Date(0), ...over,
});
const entryRow = (over: Record<string, unknown> = {}) => ({
  id: ENTRY, interpreterId: ME, cycleId: null, earnedOn: "2025-05-01", title: SECRET, provider: "Acme", category: "Webinar", amount: "0.30", unit: "ceu",
  isEthics: false, isPpo: false, createdAt: new Date(0), updatedAt: new Date(0), ...over,
});
const audits = () => state.inserted.filter((i) => i.table === "audit_logs").map((i) => i.values as { action: string; details: string });
const pgError = (code: string): Error => Object.assign(new Error("pg"), { code });
const mine = () => { state.session = interpreter(ME); };

describe("who may use the CEU actions", () => {
  it("only a signed-in interpreter linked to a profile; nothing is read or written otherwise", async () => {
    assert.equal((await saveCycle(cycleForm)).success, false);
    assert.equal((await saveEntry(entryForm)).success, false);
    assert.equal((await deleteCycle(CYCLE)).success, false);
    assert.equal((await deleteEntry(ENTRY)).success, false);
    assert.deepEqual(await loadMine(), { status: "not_linked" });
    state.session = agency();
    assert.equal((await saveCycle(cycleForm)).success, false);
    assert.deepEqual(await loadMine(), { status: "not_linked" });
    state.session = { user: { id: "login-1", role: "interpreter", interpreterId: null } };
    assert.equal((await saveEntry(entryForm)).success, false);
    assert.deepEqual(state.ops, []);
  });
});

describe("loadMyCeu", () => {
  it("returns the signed-in interpreter's cycles and entries as views, scoped by interpreter_id", async () => {
    mine();
    state.rows[CYCLES] = [cycleRow()];
    state.rows[ENTRIES] = [entryRow({ cycleId: CYCLE })];
    const data = await loadMine();
    assert.equal(data.status, "ok");
    assert.equal(data.cycles?.length, 1);
    assert.equal(data.entries?.length, 1);
    for (const table of [CYCLES, ENTRIES]) {
      const sent = state.wheres.find((w) => w.table === table);
      assert.ok(sent, table);
      const { sql, params } = await renderWhere(sent.condition);
      assert.match(sql, /"interpreter_id" = \$1/);
      assert.deepEqual(params, [ME]);
    }
  });
  it("says not_ready when the 0017 tables are missing (42P01) and error otherwise, never throwing", async () => {
    mine();
    state.errors[CYCLES] = pgError("42P01");
    assert.deepEqual(await loadMine(), { status: "not_ready" });
    state.errors[CYCLES] = new Error("boom");
    assert.deepEqual(await loadMine(), { status: "error" });
  });
});

describe("saveCycle", () => {
  it("adds a cycle for the session's interpreter whatever the form says, and audits only its id", async () => {
    mine();
    const result = await saveCycle({ ...cycleForm, interpreterId: "someone-else" });
    assert.ok(result.success);
    const inserted = state.inserted.find((i) => i.table === CYCLES)?.values as Record<string, unknown>;
    assert.equal(inserted.interpreterId, ME);
    assert.equal(inserted.requiredTotal, "8.00");
    assert.equal(inserted.requiredPpo, null);
    assert.equal(inserted.credentialId, null);
    assert.deepEqual(audits().map((a) => a.action), ["ceu_cycle_created"]);
    assert.match(audits()[0].details, /^cycleId=/);
    assert.ok(!JSON.stringify(audits()).includes(SECRET), "no cycle name in the audit log");
  });
  it("works standalone, and links a credential only when it is the interpreter's own", async () => {
    mine();
    assert.ok((await saveCycle(cycleForm)).success);
    reset();
    mine();
    state.rows.credentials = [];
    const foreign = await saveCycle({ ...cycleForm, credentialId: CRED });
    assert.ok(!foreign.success && foreign.fieldErrors?.credentialId);
    assert.ok(!state.ops.includes(`insert:${CYCLES}`));
    state.rows.credentials = [{ id: CRED }];
    assert.ok((await saveCycle({ ...cycleForm, credentialId: CRED })).success);
    assert.equal((state.inserted.find((i) => i.table === CYCLES)?.values as Record<string, unknown>).credentialId, CRED);
  });
  it("refuses an invalid form with field errors and writes nothing", async () => {
    mine();
    const result = await saveCycle({ ...cycleForm, label: "", cycleEnd: "2023-01-01" });
    assert.ok(!result.success && result.fieldErrors?.label && result.fieldErrors?.cycleEnd);
    assert.deepEqual(state.ops, []);
  });
  it("updates only a row that is the interpreter's own (id AND interpreter_id), and a missing one is not found", async () => {
    mine();
    state.returning[CYCLES] = [cycleRow({ label: "Renamed" })];
    assert.ok((await saveCycle({ ...cycleForm, id: CYCLE })).success);
    const sent = state.wheres.filter((w) => w.table === CYCLES).at(-1);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"id" = \$1/);
    assert.match(sql, /"interpreter_id" = \$2/);
    assert.deepEqual(params, [CYCLE, ME]);
    assert.deepEqual(audits().map((a) => a.action), ["ceu_cycle_updated"]);
    reset();
    mine();
    state.returning[CYCLES] = [];
    assert.equal((await saveCycle({ ...cycleForm, id: CYCLE })).success, false);
    assert.equal((await saveCycle({ ...cycleForm, id: "not-a-uuid" })).success, false);
  });
  it("will not change the unit, or the dates, under entries already assigned", async () => {
    mine();
    state.rows[ENTRIES] = [{ earnedOn: "2025-05-01", unit: "ceu" }];
    const unit = await saveCycle({ ...cycleForm, unit: "hours", id: CYCLE });
    assert.ok(!unit.success && /logged in ceus/.test(unit.error));
    const dates = await saveCycle({ ...cycleForm, cycleStart: "2025-06-01", id: CYCLE });
    assert.ok(!dates.success && /falls outside/.test(dates.error));
    assert.ok(!state.ops.includes(`update:${CYCLES}`));
  });
  it("stops at 20 cycles, and says plainly when the table is missing or anything else fails", async () => {
    mine();
    state.counts[CYCLES] = 20;
    const full = await saveCycle(cycleForm);
    assert.ok(!full.success && /limit of 20 cycles/.test(full.error));
    state.counts[CYCLES] = 1;
    state.writeErrors[CYCLES] = pgError("42P01");
    const missing = await saveCycle(cycleForm);
    assert.ok(!missing.success && /not set up on this database yet/.test(missing.error));
    state.writeErrors[CYCLES] = new Error("boom");
    const other = await saveCycle(cycleForm);
    assert.ok(!other.success && /could not save/.test(other.error) && !JSON.stringify(other).includes("boom"));
    assert.deepEqual(audits(), [], "nothing is audited for a refused write");
  });
});

describe("saveEntry", () => {
  it("logs an entry with no cycle for the session's interpreter, and audits only its id", async () => {
    mine();
    const result = await saveEntry({ ...entryForm, interpreterId: "someone-else" });
    assert.ok(result.success);
    const inserted = state.inserted.find((i) => i.table === ENTRIES)?.values as Record<string, unknown>;
    assert.equal(inserted.interpreterId, ME);
    assert.equal(inserted.amount, "0.30");
    assert.equal(inserted.cycleId, null);
    assert.deepEqual(audits().map((a) => a.action), ["ceu_entry_created"]);
    assert.ok(!JSON.stringify(audits()).includes(SECRET) && !JSON.stringify(audits()).includes("Acme"), "no title or provider in the audit log");
  });
  it("in a cycle it takes the cycle's unit, whatever the form says", async () => {
    mine();
    state.rows[CYCLES] = [cycleRow({ unit: "hours" })];
    const result = await saveEntry({ ...entryForm, cycleId: CYCLE, unit: "ceu" });
    assert.ok(result.success);
    assert.equal((state.inserted.find((i) => i.table === ENTRIES)?.values as Record<string, unknown>).unit, "hours");
  });
  it("refuses a cycle that is not the interpreter's own, and a date outside the cycle", async () => {
    mine();
    state.rows[CYCLES] = [];
    const foreign = await saveEntry({ ...entryForm, cycleId: CYCLE });
    assert.ok(!foreign.success && foreign.fieldErrors?.cycleId);
    state.rows[CYCLES] = [cycleRow()];
    const outside = await saveEntry({ ...entryForm, cycleId: CYCLE, earnedOn: "2020-01-01" });
    assert.ok(!outside.success && /outside this cycle/.test(outside.error) && outside.fieldErrors?.earnedOn);
    assert.ok(!state.ops.includes(`insert:${ENTRIES}`));
    const sent = state.wheres.find((w) => w.table === CYCLES);
    assert.ok(sent);
    assert.deepEqual((await renderWhere(sent.condition)).params, [CYCLE, ME]);
  });
  it("refuses an invalid form and writes nothing", async () => {
    mine();
    const result = await saveEntry({ ...entryForm, title: "", amount: "0" });
    assert.ok(!result.success && result.fieldErrors?.title && result.fieldErrors?.amount);
    assert.deepEqual(state.ops, []);
  });
  it("updates by id AND interpreter, and stops at 2,000 entries", async () => {
    mine();
    state.returning[ENTRIES] = [entryRow()];
    assert.ok((await saveEntry({ ...entryForm, id: ENTRY })).success);
    const sent = state.wheres.filter((w) => w.table === ENTRIES).at(-1);
    assert.ok(sent);
    assert.deepEqual((await renderWhere(sent.condition)).params, [ENTRY, ME]);
    assert.deepEqual(audits().map((a) => a.action), ["ceu_entry_updated"]);
    reset();
    mine();
    state.returning[ENTRIES] = [];
    assert.equal((await saveEntry({ ...entryForm, id: ENTRY })).success, false);
    reset();
    mine();
    state.counts[ENTRIES] = 2000;
    const full = await saveEntry(entryForm);
    assert.ok(!full.success && /limit of 2,000/.test(full.error));
  });
  it("says plainly when the table is missing", async () => {
    mine();
    state.writeErrors[ENTRIES] = pgError("42P01");
    const missing = await saveEntry(entryForm);
    assert.ok(!missing.success && /not set up on this database yet/.test(missing.error));
  });
});

describe("deleteCycle and deleteEntry", () => {
  it("delete by id AND interpreter, audit the id, and an unknown or foreign id is not found", async () => {
    mine();
    state.returning[CYCLES] = [{ id: CYCLE }];
    assert.deepEqual(await deleteCycle(CYCLE), { success: true });
    const sent = state.wheres.filter((w) => w.table === CYCLES).at(-1);
    assert.ok(sent);
    assert.deepEqual((await renderWhere(sent.condition)).params, [CYCLE, ME]);
    state.returning[ENTRIES] = [{ id: ENTRY }];
    assert.deepEqual(await deleteEntry(ENTRY), { success: true });
    assert.deepEqual(audits().map((a) => [a.action, a.details]), [["ceu_cycle_deleted", `cycleId=${CYCLE}`], ["ceu_entry_deleted", `entryId=${ENTRY}`]]);
    reset();
    mine();
    state.returning[CYCLES] = [];
    state.returning[ENTRIES] = [];
    assert.equal((await deleteCycle(CYCLE)).success, false);
    assert.equal((await deleteEntry(ENTRY)).success, false);
    assert.equal((await deleteCycle("nope")).success, false);
    assert.equal((await deleteEntry("nope")).success, false);
  });
});

describe("GET /api/profile/ceu/export", () => {
  const get = (query = "") => GET(new Request(`http://localhost/api/profile/ceu/export${query}`));
  const text = async (r: Response) => new TextDecoder().decode(new Uint8Array(await r.arrayBuffer()).slice(3));

  it("needs a sign-in (401) and an interpreter (403), and reads nothing otherwise", async () => {
    assert.equal((await get()).status, 401);
    state.session = agency();
    assert.equal((await get()).status, 403);
    assert.deepEqual(state.ops, []);
  });
  it("downloads only the signed-in interpreter's entries, never cached, narrowed by the view, with the formula guard", async () => {
    mine();
    state.rows[CYCLES] = [cycleRow({ label: "Cycle A" })];
    state.rows[ENTRIES] = [
      entryRow({ cycleId: CYCLE, isEthics: true }),
      entryRow({ id: "2", title: "=1+1", provider: null, earnedOn: "2025-06-01", amount: "1.00" }),
    ];
    const all = await get();
    assert.equal(all.status, 200);
    assert.equal(all.headers.get("cache-control"), "no-store, private");
    assert.match(all.headers.get("content-disposition") ?? "", /^attachment; filename="terpdesk-ceu-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = (await text(all)).split("\r\n");
    assert.equal(lines[0], "Date earned,Title,Provider,Category,Amount,Unit,Ethics,PPO,Cycle");
    assert.equal(lines.length, 3);
    assert.ok(lines.some((l) => l.includes("'=1+1")), "the formula is neutralised");
    const sent = state.wheres.find((w) => w.table === ENTRIES);
    assert.ok(sent);
    assert.deepEqual((await renderWhere(sent.condition)).params, [ME]);
    const ethics = (await text(await get("?focus=ethics"))).split("\r\n");
    assert.equal(ethics.length, 2);
    assert.ok(ethics[1].endsWith("Yes,,Cycle A"));
    assert.deepEqual(audits().map((a) => [a.action, a.details]), [["ceu_exported", "rows=2"], ["ceu_exported", "rows=1"]]);
    assert.ok(!JSON.stringify(audits()).includes(SECRET));
  });
  it("answers 503 when the tables are missing and 500 without leaking the error otherwise", async () => {
    mine();
    state.errors[CYCLES] = pgError("42P01");
    assert.equal((await get()).status, 503);
    state.errors[CYCLES] = new Error("boom-secret");
    const failed = await get();
    assert.equal(failed.status, 500);
    assert.ok(!(await failed.text()).includes("boom-secret"));
  });
});
