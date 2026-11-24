import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, renderWhere, reset, state } from "../availability/harness";

type Term = { id: string; term: string; rendering: string; setting: string; note: string };
type SaveResult = { success: true; term: Term } | { success: false; error: string; fieldErrors?: Record<string, string> };
type ImportResult = { success: true; added: number; duplicates: number; invalid: number; overLimit: number } | { success: false; error: string };
type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;

let list: Fn<[], Term[]>;
let save: Fn<[Record<string, unknown>], SaveResult>;
let remove: Fn<[string], { success: boolean; error?: string }>;
let importCsv: Fn<[string], ImportResult>;
let GET: (request: Request) => Promise<Response>;

before(async () => {
  await install();
  const actions = (await import("@/app/actions/glossary")) as unknown as {
    listMyGlossaryTerms: typeof list; saveGlossaryTerm: typeof save; deleteGlossaryTerm: typeof remove; importGlossaryCsv: typeof importCsv;
  };
  list = actions.listMyGlossaryTerms;
  save = actions.saveGlossaryTerm;
  remove = actions.deleteGlossaryTerm;
  importCsv = actions.importGlossaryCsv;
  GET = (await import("@/app/api/glossary/export/route") as { GET: typeof GET }).GET;
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const ID = "7a08c616-3ea4-477d-ad5c-b0b0cdf643b4";
const TABLE = "interpreter_glossary_terms";
const SECRET = "Okafor oncology";
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before building a glossary.";
const form = { term: "chemotherapy", rendering: "CHEMO-MEDICINE", sourceLang: "English", targetLang: "ASL", setting: "Medical", note: SECRET };
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, interpreterId: ME, term: "chemotherapy", rendering: "CHEMO-MEDICINE", sourceLang: "English", targetLang: "ASL", setting: "Medical", note: SECRET, createdAt: new Date(0), updatedAt: new Date(0), ...over,
});
const audits = () => state.inserted.filter((i) => i.table === "audit_logs").map((i) => i.values as { action: string; details: string });
const pgError = (code: string): Error => Object.assign(new Error("pg"), { code });

describe("who may use the glossary actions", () => {
  it("only a signed-in interpreter linked to a profile; nothing is read or written otherwise", async () => {
    assert.deepEqual(await save(form), { success: false, error: NOT_LINKED });
    assert.deepEqual(await remove(ID), { success: false, error: NOT_LINKED });
    assert.deepEqual(await importCsv("term,rendering\na,b\n"), { success: false, error: NOT_LINKED });
    await assert.rejects(() => list(), /Unauthorized/);
    state.session = agency();
    assert.equal((await save(form)).success, false);
    await assert.rejects(() => list(), /Forbidden/);
    state.session = { user: { id: "login-1", role: "interpreter", interpreterId: null } };
    assert.equal((await save(form)).success, false);
    assert.deepEqual(state.ops, []);
  });
});

describe("listMyGlossaryTerms", () => {
  it("reads only the signed-in interpreter's rows, as views", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row()];
    const terms = await list();
    assert.equal(terms.length, 1);
    assert.equal(terms[0].term, "chemotherapy");
    const sent = state.wheres.find((w) => w.table === TABLE);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"interpreter_id" = \$1/);
    assert.deepEqual(params, [ME]);
  });
});

describe("saveGlossaryTerm", () => {
  it("adds a term for the session's interpreter, whatever the form says, and audits only its id", async () => {
    state.session = interpreter(ME);
    const result = await save({ ...form, interpreterId: "someone-else" });
    assert.ok(result.success);
    const inserted = state.inserted.find((i) => i.table === TABLE)?.values as Record<string, unknown>;
    assert.equal(inserted.interpreterId, ME);
    assert.deepEqual(Object.keys(inserted).sort(), ["interpreterId", "note", "rendering", "setting", "sourceLang", "targetLang", "term"]);
    assert.deepEqual(audits().map((a) => a.action), ["glossary_term_created"]);
    assert.match(audits()[0].details, /^termId=/);
    assert.ok(!JSON.stringify(audits()).includes("chemo") && !JSON.stringify(audits()).includes(SECRET), "no term, rendering or note in the audit log");
  });

  it("refuses an invalid form with field errors and writes nothing", async () => {
    state.session = interpreter(ME);
    const result = await save({ ...form, term: "", setting: "Poetry" });
    assert.ok(!result.success && result.fieldErrors?.term && result.fieldErrors?.setting);
    assert.deepEqual(state.ops, []);
  });

  it("updates only a row that is the interpreter's own (id AND interpreter_id), and a missing one is not found", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [row({ rendering: "CHEMO" })];
    assert.ok((await save({ ...form, rendering: "CHEMO", id: ID })).success);
    const sent = state.wheres.filter((w) => w.table === TABLE).at(-1);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"id" = \$1/);
    assert.match(sql, /"interpreter_id" = \$2/);
    assert.deepEqual(params, [ID, ME]);
    assert.deepEqual(audits().map((a) => a.action), ["glossary_term_updated"]);
    reset();
    state.session = interpreter(ME);
    state.returning[TABLE] = [];
    assert.deepEqual(await save({ ...form, id: ID }), { success: false, error: "That term could not be found." });
    assert.deepEqual(await save({ ...form, id: "not-a-uuid" }), { success: false, error: "That term could not be found." });
  });

  it("stops at 5,000 terms", async () => {
    state.session = interpreter(ME);
    state.counts[TABLE] = 5000;
    const result = await save(form);
    assert.ok(!result.success && /limit of 5,000 terms/.test(result.error));
    assert.ok(!state.ops.includes(`insert:${TABLE}`));
  });

  it("says plainly when the same term and rendering exist already (unique index), and when the table is missing", async () => {
    state.session = interpreter(ME);
    state.writeErrors[TABLE] = pgError("23505");
    const duplicate = await save(form);
    assert.ok(!duplicate.success && /already have this term/.test(duplicate.error) && duplicate.fieldErrors?.rendering);
    assert.deepEqual(audits(), [], "nothing is audited for a refused write");
    state.writeErrors[TABLE] = pgError("42P01");
    const missing = await save(form);
    assert.ok(!missing.success && /not set up on this database yet/.test(missing.error));
    state.writeErrors[TABLE] = new Error("boom");
    const other = await save(form);
    assert.ok(!other.success && /could not save/.test(other.error) && !JSON.stringify(other).includes("boom"));
  });
});

describe("deleteGlossaryTerm", () => {
  it("deletes by id AND interpreter, audits the id, and an unknown or foreign id is not found", async () => {
    state.session = interpreter(ME);
    state.returning[TABLE] = [{ id: ID }];
    assert.deepEqual(await remove(ID), { success: true });
    const sent = state.wheres.filter((w) => w.table === TABLE).at(-1);
    assert.ok(sent);
    assert.deepEqual((await renderWhere(sent.condition)).params, [ID, ME]);
    assert.deepEqual(audits().map((a) => [a.action, a.details]), [["glossary_term_deleted", `termId=${ID}`]]);
    reset();
    state.session = interpreter(ME);
    state.returning[TABLE] = [];
    assert.deepEqual(await remove(ID), { success: false, error: "That term could not be found." });
    assert.deepEqual(await remove("nope"), { success: false, error: "That term could not be found." });
  });
});

describe("importGlossaryCsv", () => {
  const csv = "Source term,Target rendering,Source language,Target language,Setting,Context note\nA,a,English,ASL,Legal,\nB,b,English,ASL,,\nA,A,English,ASL,Legal,\n,x,English,ASL,,\n";

  it("adds the valid rows to the session's interpreter, counts duplicates and invalid rows, and audits counts only", async () => {
    state.session = interpreter(ME);
    state.counts[TABLE] = 10;
    state.returning[TABLE] = [{ id: "1" }];
    const result = await importCsv(csv);
    assert.deepEqual(result, { success: true, added: 1, duplicates: 1, invalid: 2, overLimit: 0 });
    const inserted = state.inserted.find((i) => i.table === TABLE)?.values as { interpreterId: string }[];
    assert.equal(inserted.length, 2);
    assert.ok(inserted.every((v) => v.interpreterId === ME));
    assert.deepEqual(audits().map((a) => [a.action, a.details]), [["glossary_imported", "added=1; duplicates=1; invalid=2; overLimit=0"]]);
  });

  it("takes only what fits under the 5,000 limit and says how many did not", async () => {
    state.session = interpreter(ME);
    state.counts[TABLE] = 4999;
    state.returning[TABLE] = [{ id: "1" }];
    const result = await importCsv(csv);
    assert.ok(result.success && result.added === 1 && result.overLimit === 1);
    assert.equal((state.inserted.find((i) => i.table === TABLE)?.values as unknown[]).length, 1);
  });

  it("refuses an unusable file without touching the database", async () => {
    state.session = interpreter(ME);
    assert.deepEqual(await importCsv("name,value\nx,y\n"), { success: false, error: "The first row must name the columns, including Source term and Target rendering." });
    assert.deepEqual(state.ops, []);
  });
});

describe("GET /api/glossary/export", () => {
  const get = (query = "") => GET(new Request(`http://localhost/api/glossary/export${query}`));
  const text = async (r: Response) => new TextDecoder().decode(new Uint8Array(await r.arrayBuffer()).slice(3));

  it("needs a sign-in (401) and an interpreter (403), and reads nothing otherwise", async () => {
    assert.equal((await get()).status, 401);
    state.session = agency();
    assert.equal((await get()).status, 403);
    assert.deepEqual(state.ops, []);
  });

  it("downloads the signed-in interpreter's own terms in the import's columns, never cached, narrowed by the view the page shows", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row(), row({ id: "2", term: "subpoena", rendering: "COURT-PAPER", setting: "Legal", note: null })];
    const sent = await get();
    assert.equal(sent.status, 200);
    assert.equal(sent.headers.get("cache-control"), "no-store, private");
    assert.match(sent.headers.get("content-disposition") ?? "", /^attachment; filename="terpdesk-glossary-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = (await text(sent)).split("\r\n");
    assert.equal(lines[0], "Source term,Target rendering,Source language,Target language,Setting,Context note");
    assert.equal(lines.length, 3);
    assert.deepEqual((await renderWhere(state.wheres.find((w) => w.table === TABLE)?.condition)).params, [ME]);
    const narrowed = (await text(await get("?setting=Legal"))).split("\r\n");
    assert.equal(narrowed.length, 2);
    assert.ok(narrowed[1].startsWith("subpoena,COURT-PAPER"));
    assert.deepEqual(audits().map((a) => a.details), ["rows=2", "rows=1"]);
  });

  it("escapes cells a spreadsheet would run as a formula", async () => {
    state.session = interpreter(ME);
    state.rows[TABLE] = [row({ term: "=HYPERLINK(\"x\")", rendering: "@SUM(A1)", note: "+1" })];
    const body = await text(await get());
    for (const raw of ["=HYPERLINK", "@SUM", "+1"]) assert.ok(body.includes(`'${raw}`), `${raw} is escaped`);
  });

  it("says the glossary is not set up when the table is missing (503), not an error page", async () => {
    state.session = interpreter(ME);
    state.errors[TABLE] = pgError("42P01");
    assert.equal((await get()).status, 503);
  });
});
