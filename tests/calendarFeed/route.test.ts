import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { install, renderWhere, reset, state } from "../availability/harness";
import { generateFeedToken, hashFeedToken } from "@/lib/calendarFeed/token";

const FEEDS = "interpreter_calendar_feeds";
const OFFERS = "offers";
const PERSONAL = "interpreter_personal_jobs";
const BUSY = "busy_blocks";
const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const NOT_ME = "99999999-9999-4999-8999-999999999999";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TOKEN = generateFeedToken();

let GET: (request: Request, context: { params: { token: string } }) => Promise<Response>;
const fetchFeed = (segment: string, headers: Record<string, string> = {}): Promise<Response> =>
  GET(new Request(`http://localhost/api/calendar/feed/${segment}`, { headers }), { params: { token: segment } });

before(async () => {
  await install();
  GET = (await import("@/app/api/calendar/feed/[token]/route") as { GET: typeof GET }).GET;
});
beforeEach(reset);

const pgError = (code: string): Error => Object.assign(new Error("pg"), { code });
/** What the one UPDATE ... RETURNING answers for an active feed. */
const activeFeed = (over: Record<string, unknown> = {}) => {
  state.returning[FEEDS] = [{ interpreterId: ME, level: "busy", windowStartedAt: new Date(), windowCount: 1, ...over }];
};
const offerRow = (over: Record<string, unknown> = {}) => ({
  offerId: "11111111-1111-4111-8111-111111111111", offerStatus: "accepted", offerUpdatedAt: new Date("2026-11-01T00:00:00Z"), requestStatus: "Booked", canceledAt: null,
  title: "Seattle Children's Hospital", createdAt: new Date("2026-10-01T00:00:00Z"), requestUpdatedAt: new Date("2026-11-02T00:00:00Z"),
  data: { startsAt: new Date(Date.now() + 2 * DAY).toISOString(), endsAt: new Date(Date.now() + 2 * DAY + HOUR).toISOString(), details: { setting: "Medical Provider-Medicaid", location: "123 Pine St", clientName: "Mr Okafor" }, clientName: "Mr Okafor" },
  ...over,
});
const personalRow = (over: Record<string, unknown> = {}) => ({ id: "22222222-2222-4222-8222-222222222222", setting: "Legal", startsAt: new Date(Date.now() + 3 * DAY), endsAt: new Date(Date.now() + 3 * DAY + 2 * HOUR), updatedAt: new Date("2026-11-03T00:00:00Z"), label: "Mr Okafor chemotherapy", ...over });
const busyRow = (over: Record<string, unknown> = {}) => ({ id: "33333333-3333-4333-8333-333333333333", startsAt: new Date(Date.now() + 4 * DAY), endsAt: new Date(Date.now() + 4 * DAY + HOUR), revision: 3, title: "Dentist for Mr Okafor", ...over });
const bodyOf = async (r: Response): Promise<string> => r.text();
const summaries = (ics: string): string[] => Array.from(ics.matchAll(/^SUMMARY:(.*)$/gm)).map((m) => m[1].replace(/\r$/, ""));

describe("404 parity: nothing tells a revoked, unknown or malformed address apart", () => {
  const snapshot = async (r: Response) => ({ status: r.status, body: await bodyOf(r), headers: Object.fromEntries(Array.from(r.headers.entries()).sort()) });

  it("a malformed secret, an unknown one, a revoked one and a database without the table all get the identical answer", async () => {
    const answers = [];
    // malformed: never reaches the database
    answers.push(await snapshot(await fetchFeed("not-a-secret")));
    assert.deepEqual(state.ops, [], "a malformed secret reads nothing");
    answers.push(await snapshot(await fetchFeed("a".repeat(44))));
    answers.push(await snapshot(await fetchFeed(`${TOKEN}.txt`)));
    // unknown, and revoked (the update only matches active rows, so a revoked hash matches none): the same empty answer
    state.returning[FEEDS] = [];
    answers.push(await snapshot(await fetchFeed(`${TOKEN}.ics`)));
    answers.push(await snapshot(await fetchFeed(TOKEN)));
    // a database that has not had migration 0016
    state.writeErrors[FEEDS] = pgError("42P01");
    answers.push(await snapshot(await fetchFeed(`${TOKEN}.ics`)));
    for (const a of answers) assert.deepEqual(a, answers[0]);
    assert.equal(answers[0].status, 404);
    assert.equal(answers[0].body, "Not found");
    assert.equal(answers[0].headers["cache-control"], "no-store");
    assert.equal(answers[0].headers["referrer-policy"], "no-referrer");
  });

  it("a revoked feed is excluded in the statement itself (revoked_at is null), so it can never be served", async () => {
    state.returning[FEEDS] = [];
    await fetchFeed(`${TOKEN}.ics`);
    const sent = state.wheres.find((w) => w.table === FEEDS);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"token_hash" = \$1/);
    assert.match(sql, /"revoked_at" is null/);
    assert.deepEqual(params, [hashFeedToken(TOKEN)], "looked up by the hash, never the secret");
  });

  it("any other database failure is a 503 that says nothing about the feed", async () => {
    state.writeErrors[FEEDS] = new Error("connection refused: secret-detail");
    const r = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(r.status, 503);
    assert.ok(!(await bodyOf(r)).includes("secret-detail"));
  });
});

describe("the rate limit", () => {
  it("allows 60 fetches in the hour and answers the 61st with 429 and Retry-After for the rest of the window", async () => {
    activeFeed({ windowCount: 60, windowStartedAt: new Date(Date.now() - 10 * 60_000) });
    assert.equal((await fetchFeed(`${TOKEN}.ics`)).status, 200);
    activeFeed({ windowCount: 61, windowStartedAt: new Date(Date.now() - 10 * 60_000) });
    const limited = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(limited.status, 429);
    const retry = Number(limited.headers.get("retry-after"));
    assert.ok(retry >= 2990 && retry <= 3000, `Retry-After is the rest of the hour (${retry})`);
    assert.equal(limited.headers.get("cache-control"), "no-store");
  });

  it("Retry-After is never more than the hour, even if the database's clock is ahead of this server's", async () => {
    activeFeed({ windowCount: 61, windowStartedAt: new Date(Date.now() + 5_000) });
    const limited = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3600");
  });

  it("a limited fetch builds nothing (no reads of jobs, personal jobs or busy time)", async () => {
    activeFeed({ windowCount: 500 });
    state.ops = [];
    await fetchFeed(`${TOKEN}.ics`);
    assert.deepEqual(state.ops, [`update:${FEEDS}`]);
  });

  it("is counted and answered in ONE statement: the window restart, the count and last-synced are all in the single UPDATE", async () => {
    activeFeed();
    await fetchFeed(`${TOKEN}.ics`);
    const updates = state.updated.filter((u) => u.table === FEEDS);
    assert.equal(updates.length, 1, "one UPDATE per fetch, not a read and then a write");
    assert.deepEqual(Object.keys(updates[0].set as object).sort(), ["lastFetchedAt", "windowCount", "windowStartedAt"]);
  });
});

describe("a good fetch", () => {
  it("is a calendar: right headers, CRLF, the jobs, personal jobs and busy time, and reads only the feed row's interpreter", async () => {
    activeFeed({ interpreterId: ME });
    state.rows[OFFERS] = [offerRow()];
    state.rows[PERSONAL] = [personalRow()];
    state.rows[BUSY] = [busyRow()];
    const r = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(r.headers.get("cache-control") ?? "", /^private,/);
    assert.match(r.headers.get("etag") ?? "", /^"[0-9a-f]{32}"$/);
    assert.ok(!r.headers.has("set-cookie"));
    const ics = await bodyOf(r);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
    assert.ok(!/(^|[^\r])\n/.test(ics), "every line break is CRLF");
    assert.deepEqual(summaries(ics), ["terpDESK job", "Personal job", "Busy"]);
    for (const table of [OFFERS, PERSONAL, BUSY]) {
      const sent = state.wheres.find((w) => w.table === table);
      assert.ok(sent, table);
      assert.ok((await renderWhere(sent.condition)).params.includes(ME), `${table} is read for the feed's interpreter`);
    }
    assert.ok(!JSON.stringify(state.wheres.map((w) => w.table)).includes(NOT_ME));
  });

  it("writes nothing but the counter: no audit row and no other write for a fetch", async () => {
    activeFeed();
    await fetchFeed(`${TOKEN}.ics`);
    assert.deepEqual(state.inserted, []);
    assert.deepEqual(state.ops.filter((o) => o.startsWith("insert") || o.startsWith("delete")), []);
  });

  it("says nothing private at the default level: no client, place, label, title or setting words reach the calendar", async () => {
    activeFeed({ level: "busy" });
    state.rows[OFFERS] = [offerRow()];
    state.rows[PERSONAL] = [personalRow()];
    state.rows[BUSY] = [busyRow()];
    const ics = await bodyOf(await fetchFeed(`${TOKEN}.ics`));
    for (const secret of ["Okafor", "chemotherapy", "Children", "Pine", "Medicaid", "Medical", "Legal", "Dentist", TOKEN]) assert.ok(!ics.includes(secret), `${secret} must not be in the feed`);
  });

  it("at the generic level a job names one category, never the form's own words", async () => {
    activeFeed({ level: "generic" });
    state.rows[OFFERS] = [offerRow()];
    state.rows[PERSONAL] = [personalRow()];
    state.rows[BUSY] = [busyRow()];
    const ics = await bodyOf(await fetchFeed(`${TOKEN}.ics`));
    assert.deepEqual(summaries(ics), ["terpDESK job: Medical", "Personal job: Legal", "Busy"]);
    for (const secret of ["Okafor", "chemotherapy", "Children", "Pine", "Medicaid", "Dentist"]) assert.ok(!ics.includes(secret), `${secret} must not be in the feed`);
  });

  it("never asks the database for a private word: no personal-job label, no busy-block title", async () => {
    activeFeed();
    state.rows[PERSONAL] = [personalRow()];
    state.rows[BUSY] = [busyRow()];
    await fetchFeed(`${TOKEN}.ics`);
    const asked = (table: string) => state.selects.filter((s) => s.table === table).flatMap((s) => s.fields);
    assert.ok(asked(PERSONAL).length > 0 && !asked(PERSONAL).includes("label"));
    assert.ok(asked(BUSY).length > 0 && !asked(BUSY).includes("title"));
  });

  it("leaves out a cancelled request, a job that is not accepted, a test job, and anything outside 30 days back to 180 ahead", async () => {
    activeFeed();
    const at = (days: number) => ({ startsAt: new Date(Date.now() + days * DAY).toISOString(), endsAt: new Date(Date.now() + days * DAY + HOUR).toISOString() });
    state.rows[OFFERS] = [
      offerRow({ offerId: "a1111111-1111-4111-8111-111111111111" }),
      offerRow({ offerId: "b1111111-1111-4111-8111-111111111111", canceledAt: new Date() }),
      offerRow({ offerId: "c1111111-1111-4111-8111-111111111111", requestStatus: "Cancelled" }),
      offerRow({ offerId: "d1111111-1111-4111-8111-111111111111", offerStatus: "pending" }),
      offerRow({ offerId: "e1111111-1111-4111-8111-111111111111", title: "Dale Fictional test" }),
      offerRow({ offerId: "f1111111-1111-4111-8111-111111111111", data: { ...at(-20), details: {} } }),
      offerRow({ offerId: "f2111111-1111-4111-8111-111111111111", data: { ...at(-40), details: {} } }),
      offerRow({ offerId: "f3111111-1111-4111-8111-111111111111", data: { ...at(170), details: {} } }),
      offerRow({ offerId: "f4111111-1111-4111-8111-111111111111", data: { ...at(200), details: {} } }),
    ];
    const ics = await bodyOf(await fetchFeed(`${TOKEN}.ics`));
    const uids = Array.from(ics.matchAll(/^UID:(.*)@terpdesk\r$/gm)).map((m) => m[1]);
    assert.deepEqual(uids.sort(), ["job-a1111111-1111-4111-8111-111111111111", "job-f1111111-1111-4111-8111-111111111111", "job-f3111111-1111-4111-8111-111111111111"].sort());
  });

  it("a database without migration 0014 (no personal jobs table) still serves the rest", async () => {
    activeFeed();
    state.rows[OFFERS] = [offerRow()];
    state.errors[PERSONAL] = pgError("42P01");
    const r = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(r.status, 200);
    assert.deepEqual(summaries(await bodyOf(r)), ["terpDESK job"]);
  });
});

describe("ETag and 304", () => {
  const setup = () => {
    activeFeed();
    state.rows[OFFERS] = [offerRow()];
    state.rows[BUSY] = [busyRow()];
  };

  it("the same feed gives the same tag, and a calendar app that sends it back gets a bodiless 304 (also weak, in a list, or *)", async () => {
    setup();
    const first = await fetchFeed(`${TOKEN}.ics`);
    const tag = first.headers.get("etag") ?? "";
    activeFeed();
    const again = await fetchFeed(`${TOKEN}.ics`);
    assert.equal(again.headers.get("etag"), tag, "the text depends only on the data, so the tag is stable");
    for (const header of [tag, `W/${tag}`, `"other", ${tag}`, "*"]) {
      activeFeed();
      const r = await fetchFeed(`${TOKEN}.ics`, { "If-None-Match": header });
      assert.equal(r.status, 304, header);
      assert.equal(await bodyOf(r), "");
      assert.equal(r.headers.get("etag"), tag);
    }
  });

  it("a tag that does not match, or a feed that changed, gets the full 200 with a new tag", async () => {
    setup();
    const first = await fetchFeed(`${TOKEN}.ics`);
    const tag = first.headers.get("etag") ?? "";
    activeFeed();
    assert.equal((await fetchFeed(`${TOKEN}.ics`, { "If-None-Match": '"stale"' })).status, 200);
    state.rows[BUSY] = [busyRow({ revision: 4 })];
    activeFeed();
    const changed = await fetchFeed(`${TOKEN}.ics`, { "If-None-Match": tag });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), tag);
  });

  it("a 304 still counts toward the rate limit (the statement runs first)", async () => {
    setup();
    const tag = (await fetchFeed(`${TOKEN}.ics`)).headers.get("etag") ?? "";
    state.updated = [];
    activeFeed();
    await fetchFeed(`${TOKEN}.ics`, { "If-None-Match": tag });
    assert.equal(state.updated.filter((u) => u.table === FEEDS).length, 1);
  });
});
