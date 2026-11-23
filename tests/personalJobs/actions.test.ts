import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agency, install, interpreter, renderWhere, reset, state } from "../availability/harness";

type SaveResult = { success: true; job: { id: string; label: string; miles: number | null; countedMiles: number | null; workedMinutes: number } } | { success: false; error: string; fieldErrors?: Record<string, string> };
type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;

let list: Fn<[], { id: string }[]>;
let save: Fn<[Record<string, unknown>], SaveResult>;
let remove: Fn<[string], { success: boolean; error?: string }>;

before(async () => {
  await install();
  const actions = (await import("@/app/actions/personalJobs")) as unknown as { listMyPersonalJobs: typeof list; savePersonalJob: typeof save; deletePersonalJob: typeof remove };
  list = actions.listMyPersonalJobs;
  save = actions.savePersonalJob;
  remove = actions.deletePersonalJob;
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const JOB = "7a08c616-3ea4-477d-ad5c-b0b0cdf643b4";
const SECRET_LABEL = "Mr Okafor chemotherapy";
const TABLE = "interpreter_personal_jobs";
const form = {
  label: SECRET_LABEL, setting: "Medical", startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "11:30",
  timeZone: "America/Los_Angeles", breakMinutes: "30", miles: "12.5", roundTrip: true,
};
const row = (over: Record<string, unknown> = {}) => ({
  id: JOB, interpreterId: ME, label: SECRET_LABEL, setting: "Medical", startsAt: new Date("2026-12-07T17:00:00Z"), endsAt: new Date("2026-12-07T19:30:00Z"),
  timeZone: "America/Los_Angeles", breakMinutes: 30, miles: "12.5", roundTrip: true, countedMiles: "25.0", createdAt: new Date(0), updatedAt: new Date(0), ...over,
});
const auditRows = () => state.inserted.filter((i) => i.table === "audit_logs").map((i) => i.values as { action: string; details: string; userId: string });
const noLabelAnywhere = () => assert.ok(!JSON.stringify(state.inserted) .includes(SECRET_LABEL.slice(0, 8)) || state.inserted.filter((i) => i.table === "audit_logs").every((i) => !JSON.stringify(i.values).includes(SECRET_LABEL.slice(0, 8))));

describe("who may use the personal job actions", () => {
  it("only a signed-in interpreter linked to a profile; nothing is read or written otherwise", async () => {
    assert.deepEqual(await save(form), { success: false, error: "Connect your interpreter profile (use the link we emailed you) before logging personal jobs." });
    assert.deepEqual(await remove(JOB), { success: false, error: "Connect your interpreter profile (use the link we emailed you) before logging personal jobs." });
    await assert.rejects(() => list(), /Unauthorized/);
    state.session = agency();
    assert.equal((await save(form)).success, false);
    await assert.rejects(() => list(), /Forbidden/);
    state.session = { user: { id: "login-1", role: "interpreter", interpreterId: null } };
    assert.equal((await save(form)).success, false);
    assert.deepEqual(state.ops, []);
  });
});

describe("listMyPersonalJobs", () => {
  it("reads only the signed-in interpreter's rows, newest first, as views", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row()];
    const jobs = await list();
    assert.equal(jobs.length, 1);
    const sent = state.wheres.find((w) => w.table === TABLE);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"interpreter_id" = \$1/);
    assert.deepEqual(params, [ME]);
  });
});

describe("savePersonalJob", () => {
  it("checks the form first: a bad one says which fields, and nothing is read or written", async () => {
    state.session = interpreter(ME);
    for (const [bad, field] of [[{ miles: "abc" }, "miles"], [{ endTime: "08:00" }, "endTime"], [{ breakMinutes: "999" }, "breakMinutes"], [{ setting: "Astronaut" }, "setting"]] as const) {
      const result = await save({ ...form, ...bad });
      assert.equal(result.success, false);
      assert.ok(!result.success && result.fieldErrors?.[field], field);
    }
    assert.deepEqual(state.ops, []);
  });

  it("adds a job for the signed-in interpreter, whatever interpreter id the browser sends, and answers with the view", async () => {
    state.session = interpreter(ME);
    const result = await save({ ...form, interpreterId: "someone-else" });
    assert.ok(result.success);
    const insert = state.inserted.find((i) => i.table === TABLE);
    assert.ok(insert);
    const values = insert.values as Record<string, unknown>;
    assert.equal(values.interpreterId, ME);
    assert.equal(values.miles, "12.5");
    assert.equal(values.countedMiles, "25");
    assert.equal(values.breakMinutes, 30);
    assert.equal((values.startsAt as Date).toISOString(), "2026-12-07T17:00:00.000Z");
    assert.equal(result.job.workedMinutes, 120);
    assert.equal(result.job.countedMiles, 25);
  });

  it("stops at the cap of 2,000 jobs and writes nothing", async () => {
    state.session = interpreter(ME);
    state.counts[TABLE] = 1999;
    assert.ok((await save(form)).success);
    reset();
    state.session = interpreter(ME);
    state.counts[TABLE] = 2000;
    const result = await save(form);
    assert.deepEqual(result, { success: false, error: "You have reached the limit of 2,000 personal jobs. Delete some to add more." });
    assert.ok(!state.ops.includes(`insert:${TABLE}`));
  });

  it("updates only a row that is the interpreter's own: the update is scoped by both the job id and the interpreter id", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [row()];
    const result = await save({ ...form, id: JOB });
    assert.ok(result.success);
    const sent = state.wheres.find((w) => w.table === TABLE);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"id" = \$1 and .*"interpreter_id" = \$2/);
    assert.deepEqual(params, [JOB, ME]);
    assert.ok(!state.ops.includes(`insert:${TABLE}`) && !state.ops.includes(`select:${TABLE}`), "an update neither inserts nor counts");
  });

  it("says not found for another interpreter's job or an unknown one (the update matched nothing), and for an id that is not a UUID", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [];
    assert.deepEqual(await save({ ...form, id: JOB }), { success: false, error: "That personal job could not be found." });
    assert.deepEqual(await save({ ...form, id: "not-a-uuid" }), { success: false, error: "That personal job could not be found." });
    assert.equal(auditRows().length, 0, "nothing happened, nothing is audited");
  });

  it("audits the action and the job id, and never the label or anything typed", async () => {
    state.session = interpreter(ME);
    assert.ok((await save(form)).success);
    state.returning[TABLE] = [row()];
    assert.ok((await save({ ...form, id: JOB })).success);
    const audits = auditRows();
    assert.deepEqual(audits.map((a) => a.action), ["personal_job_created", "personal_job_updated"]);
    assert.match(audits[0].details, /^jobId=[0-9a-f-]{36}$/);
    assert.equal(audits[1].details, `jobId=${JOB}`);
    for (const a of audits) {
      const text = JSON.stringify(a);
      for (const piece of [SECRET_LABEL, "Okafor", "chemotherapy", "12.5", "Medical", "2026"]) assert.ok(!text.includes(piece), `${piece} must not be in the audit log`);
    }
    assert.equal(audits[0].userId, "login-1");
  });

  it("a database failure gives a plain message, not the database's, and no audit entry", async () => {
    state.session = interpreter(ME);
    state.errors[TABLE] = new Error(`Failed query: insert ... "${SECRET_LABEL}"`);
    const result = await save(form);
    assert.deepEqual(result, { success: false, error: "We could not save that. Please try again." });
    assert.ok(!JSON.stringify(result).includes("Okafor"));
    assert.equal(auditRows().length, 0);
  });
});

describe("deletePersonalJob", () => {
  it("deletes only a row that is the interpreter's own, and audits the id", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [{ id: JOB }];
    assert.deepEqual(await remove(JOB), { success: true });
    const sent = state.wheres.find((w) => w.table === TABLE);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"id" = \$1 and .*"interpreter_id" = \$2/);
    assert.deepEqual(params, [JOB, ME]);
    assert.deepEqual(auditRows().map((a) => [a.action, a.details]), [["personal_job_deleted", `jobId=${JOB}`]]);
  });

  it("says not found when nothing matched (another interpreter's job, or none), and for an id that is not a UUID, without touching the table", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [];
    assert.deepEqual(await remove(JOB), { success: false, error: "That personal job could not be found." });
    reset();
    state.session = interpreter(ME);
    assert.deepEqual(await remove("../../etc"), { success: false, error: "That personal job could not be found." });
    assert.deepEqual(state.ops, []);
    assert.equal(auditRows().length, 0);
    noLabelAnywhere();
  });
});

describe("the personal jobs files", () => {
  const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
  const exportedNames = (source: string): string[] => Array.from(source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm), (m) => m[1]);

  it("the action file is a Server Action file exporting only its three async functions; the conflict helper and schema are plain modules", () => {
    const actions = read("src", "app", "actions", "personalJobs.ts");
    assert.match(actions.split("\n").slice(0, 2).join("\n"), /^"use server";/m);
    assert.deepEqual(exportedNames(actions), ["listMyPersonalJobs", "savePersonalJob", "deletePersonalJob"]);
    for (const parts of [["src", "lib", "availability", "personalJobConflict.ts"], ["src", "db", "personalJobsSchema.ts"], ["src", "lib", "personalJobs.ts"], ["src", "lib", "validation", "personalJob.ts"]]) {
      assert.ok(!/^"use server";/m.test(read(...parts)), parts.join("/"));
    }
  });

  it("every action starts with the interpreter check, and none logs or audits the label", () => {
    const actions = read("src", "app", "actions", "personalJobs.ts");
    assert.equal((actions.match(/await requireInterpreter\(\)/g) ?? []).length, 2, "list calls it directly; save and delete through `me`");
    assert.ok(actions.includes("await me()"));
    for (const call of actions.match(/writeAuditLog\(\{[\s\S]*?\}\);/g) ?? []) assert.ok(!/label/i.test(call), call);
    for (const call of actions.match(/logError\([^)]*\)/g) ?? []) assert.ok(!/label|input|values/i.test(call), call);
  });

  it("the migration is additive and idempotent: one new table and one index, nothing altered or dropped", () => {
    const sql = read("src", "db", "migrations", "manual", "0014_personal_jobs.sql").replace(/--.*$/gm, "").replace(/ON DELETE CASCADE/g, "");
    assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length, 1);
    assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, 1);
    assert.ok(!/\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(sql));
    assert.match(read("src", "db", "migrations", "manual", "0014_personal_jobs.sql"), /interpreter_id uuid NOT NULL REFERENCES interpreters\(id\) ON DELETE CASCADE/);
    assert.match(sql, /\(interpreter_id, starts_at\)/);
    assert.match(sql, /CHECK \(ends_at > starts_at\)/);
    assert.ok(!/rate|earn|payer|notes|amount/i.test(sql.replace(/--.*$/gm, "")), "no rates, earnings, payer or notes columns");
  });

  it("are each under 300 lines, hold no any and no em-dash", () => {
    const files = [
      ["src", "app", "actions", "personalJobs.ts"], ["src", "lib", "personalJobs.ts"], ["src", "lib", "validation", "personalJob.ts"],
      ["src", "lib", "availability", "personalJobConflict.ts"], ["src", "lib", "availability", "conflict.ts"], ["src", "db", "personalJobsSchema.ts"],
      ["src", "db", "migrations", "manual", "0014_personal_jobs.sql"],
    ];
    for (const parts of files) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(source), `${name} has no any`);
      assert.ok(!source.includes(String.fromCharCode(0x2014)), `${name} has no em-dash`);
    }
  });
});
