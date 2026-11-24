import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, renderWhere, reset, state } from "../availability/harness";

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const TABLE = "interpreter_personal_jobs";
let GET: (request: Request) => Promise<Response>;
const get = (query = ''): Promise<Response> => GET(new Request(`http://localhost/api/my-work/export${query}`));

before(async () => {
  await install();
  GET = (await import("@/app/api/my-work/export/route") as { GET: typeof GET }).GET;
});
beforeEach(reset);

const row = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", label: null, setting: null, startsAt: new Date("2026-12-07T17:00:00Z"), endsAt: new Date("2026-12-07T19:30:00Z"),
  timeZone: "America/Los_Angeles", breakMinutes: 30, miles: null, roundTrip: false, countedMiles: null, ...over,
});
/** The body with its byte order mark kept (Response.text() would drop it): the three bytes, then the text after them. */
const bodyOf = async (response: Response): Promise<{ bom: number[]; text: string }> => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bom: Array.from(bytes.slice(0, 3)), text: new TextDecoder().decode(bytes.slice(3)) };
};
const audits = () => state.inserted.filter((i) => i.table === "audit_logs").map((i) => i.values as { action: string; details: string });

describe("GET /api/my-work/export", () => {
  it("needs a sign-in (401), and only an interpreter linked to a profile (403 for anyone else), and reads nothing otherwise", async () => {
    const anonymous = await get();
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");
    state.session = agency();
    assert.equal((await get()).status, 403);
    state.session = { user: { id: "login-1", role: "interpreter", interpreterId: null } };
    assert.equal((await get()).status, 403);
    assert.deepEqual(state.ops, []);
  });

  it("reads only the signed-in interpreter's rows", async () => {
    state.session = interpreter(ME);
    await get();
    const sent = state.wheres.find((w) => w.table === TABLE);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"interpreter_id" = \$1/);
    assert.deepEqual(params, [ME]);
  });

  it("downloads a CSV: header and one row per job, oldest first, never cached, with the job's own zone and no money columns", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [
      row({ id: "22222222-2222-4222-8222-222222222222", startsAt: new Date("2026-12-09T17:00:00Z"), endsAt: new Date("2026-12-09T18:00:00Z"), breakMinutes: 0 }),
      row({ label: "Conference", setting: "Education", miles: "12.5", roundTrip: true, countedMiles: "25.0" }),
    ];
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="terpdesk-personal-jobs-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const { bom, text } = await bodyOf(response);
    assert.deepEqual(bom, [0xef, 0xbb, 0xbf], "starts with a byte order mark so Excel reads it as UTF-8");
    const lines = text.split("\r\n");
    assert.equal(lines[0], "Date,Start time,End date,End time,Time zone,Setting,Label,Break (minutes),Hours worked,Miles,Round trip,Counted miles");
    assert.equal(lines[1], "2026-12-07,09:00,2026-12-07,11:30,America/Los_Angeles,Education,Conference,30,2.00,12.5,Yes,25.0");
    assert.equal(lines[2], "2026-12-09,09:00,2026-12-09,10:00,America/Los_Angeles,,,0,1.00,,No,");
    assert.equal(lines.length, 3, "a header and two jobs, nothing else");
    assert.ok(!/rate|earn|pay|amount|\$/i.test(lines[0]));
  });

  it("escapes cells a spreadsheet would run as a formula (=, +, -, @)", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row({ label: "=HYPERLINK(\"http://bad.example\",\"x\")" }), row({ id: "33333333-3333-4333-8333-333333333333", label: "@SUM(A1)", startsAt: new Date("2026-12-08T17:00:00Z"), endsAt: new Date("2026-12-08T18:00:00Z") }), row({ id: "44444444-4444-4444-8444-444444444444", label: "+1 call", startsAt: new Date("2026-12-10T17:00:00Z"), endsAt: new Date("2026-12-10T18:00:00Z") }), row({ id: "55555555-5555-4555-8555-555555555555", label: "-2+3", startsAt: new Date("2026-12-11T17:00:00Z"), endsAt: new Date("2026-12-11T18:00:00Z") })];
    const { text } = await bodyOf(await get());
    for (const raw of ["=HYPERLINK", "@SUM", "+1 call", "-2+3"]) {
      assert.ok(!text.includes(`,${raw}`) && !text.includes(`,"${raw}`), `${raw} must not start a cell`);
      assert.ok(text.includes(`'${raw}`), `${raw} is escaped with a leading quote`);
    }
  });

  it("with no jobs still downloads the header", async () => {
    state.session = interpreter(ME);
    const { text } = await bodyOf(await get());
    assert.equal(text.trimEnd(), "Date,Start time,End date,End time,Time zone,Setting,Label,Break (minutes),Hours worked,Miles,Round trip,Counted miles");
  });

  it("audits that an export happened and how many rows, never what was in them", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row({ label: "Mrs Alvarez knee surgery", setting: "Medical" }), row({ id: "66666666-6666-4666-8666-666666666666" })];
    await get();
    assert.deepEqual(audits().map((a) => [a.action, a.details]), [["personal_jobs_exported", "rows=2"]]);
    assert.ok(!JSON.stringify(audits()).includes("Alvarez"));
  });

  it("a missing table is a plain 409, any other failure a plain 500 that says nothing about the data", async () => {
    state.session = interpreter(ME);
    state.errors[TABLE] = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    const missing = await get();
    assert.equal(missing.status, 409);
    assert.match(await missing.text(), /not set up/);
    state.errors[TABLE] = new Error('Failed query: select ... "Mrs Alvarez knee surgery"');
    const failed = await get();
    assert.equal(failed.status, 500);
    const body = await failed.text();
    assert.equal(body, "Could not build the export. Please try again.");
    assert.equal(audits().length, 0);
  });
});

describe("GET /api/my-work/export carries the view the page shows", () => {
  const OLD = "77777777-7777-4777-8777-777777777777";
  const FUTURE = "88888888-8888-4888-8888-888888888888";
  const seed = () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [
      row({ id: OLD, label: "Old class", setting: "Education", startsAt: new Date("2025-01-10T17:00:00Z"), endsAt: new Date("2025-01-10T18:00:00Z"), breakMinutes: 0 }),
      row({ id: FUTURE, label: "Conference", setting: "Legal", startsAt: new Date("2099-03-02T17:00:00Z"), endsAt: new Date("2099-03-02T19:00:00Z"), breakMinutes: 0 }),
    ];
  };
  const labels = async (query: string): Promise<string[]> => {
    const { text } = await bodyOf(await get(query));
    return text.split(String.fromCharCode(13, 10)).slice(1).filter(Boolean).map((line) => line.split(",")[6]);
  };

  it("without a view it is every job (as before)", async () => {
    seed();
    assert.deepEqual((await labels("")).sort(), ["Conference", "Old class"]);
  });

  it("narrows by date range, Upcoming or Completed, search and setting, the way the page does", async () => {
    seed();
    assert.deepEqual(await labels("?range=30"), ["Conference"], "the 2025 job is outside the last 30 days");
    assert.deepEqual(await labels("?range=all&tab=completed"), ["Old class"]);
    assert.deepEqual(await labels("?range=all&tab=upcoming"), ["Conference"]);
    assert.deepEqual(await labels("?q=confer"), ["Conference"]);
    assert.deepEqual(await labels("?setting=Education"), ["Old class"]);
    assert.deepEqual(await labels("?setting=Education&tab=upcoming"), [], "a view with nothing in it is an empty export, not everything");
  });

  it("falls back to everything for a value it does not know, and never reads a search into the audit log", async () => {
    seed();
    assert.deepEqual((await labels("?range=bogus&tab=bogus&sort=bogus")).sort(), ["Conference", "Old class"]);
    await get("?q=Conference");
    assert.ok(audits().every((a) => a.details === "rows=2" || a.details === "rows=1" || a.details === "rows=0"));
    assert.ok(!JSON.stringify(audits()).includes("Conference"));
  });
});
