import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { agency, install, interpreter, renderWhere, reset, state } from "../availability/harness";
import { hashFeedToken } from "@/lib/calendarFeed/token";

type State = { status: string; feed?: { detailLevel: string; lastFetchedAt: string | null; rotatedAt: string | null } };
type Change = { success: true; state: State; url?: string } | { success: false; error: string };
type Fn<A extends unknown[], R> = (...args: A) => Promise<R>;

let get: Fn<[], State>;
let create: Fn<[string], Change>;
let rotate: Fn<[], Change>;
let revoke: Fn<[], Change>;
let setDetail: Fn<[string], Change>;

before(async () => {
  await install();
  const a = (await import("@/app/actions/calendarFeed")) as unknown as { getMyCalendarFeed: typeof get; createCalendarFeed: typeof create; rotateCalendarFeed: typeof rotate; revokeCalendarFeed: typeof revoke; setCalendarFeedDetail: typeof setDetail };
  get = a.getMyCalendarFeed; create = a.createCalendarFeed; rotate = a.rotateCalendarFeed; revoke = a.revokeCalendarFeed; setDetail = a.setCalendarFeedDetail;
});
beforeEach(reset);

const ME = "3d553a0e-d765-42b3-a89a-9ff24274f534";
const FEEDS = "interpreter_calendar_feeds";
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before subscribing a calendar.";
const row = (over: Record<string, unknown> = {}) => ({ id: "f1111111-1111-4111-8111-111111111111", interpreterId: ME, tokenHash: "0".repeat(64), detailLevel: "busy", createdAt: new Date("2026-11-01T00:00:00Z"), rotatedAt: null, revokedAt: null, lastFetchedAt: null, windowStartedAt: null, windowCount: 0, ...over });
const audits = () => state.inserted.filter((i) => i.table === "audit_logs").map((i) => i.values as { action: string; details: string });
const pgError = (code: string): Error => Object.assign(new Error("pg"), { code });
const tokenOf = (url: string): string => url.match(/\/api\/calendar\/feed\/([A-Za-z0-9_-]{43})\.ics$/)?.[1] ?? "";

describe("who may use the feed actions", () => {
  it("only a signed-in interpreter linked to a profile; nothing is read or written otherwise", async () => {
    assert.deepEqual(await create("busy"), { success: false, error: NOT_LINKED });
    assert.deepEqual(await rotate(), { success: false, error: NOT_LINKED });
    assert.deepEqual(await revoke(), { success: false, error: NOT_LINKED });
    assert.deepEqual(await setDetail("busy"), { success: false, error: NOT_LINKED });
    assert.deepEqual(await get(), { status: "not_linked" });
    state.session = agency();
    assert.equal((await create("busy")).success, false);
    state.session = { user: { id: "login-1", role: "interpreter", interpreterId: null } };
    assert.equal((await create("busy")).success, false);
    assert.deepEqual(state.ops, []);
  });
});

describe("getMyCalendarFeed", () => {
  it("none, active (with last synced), not set up, and an error, each as its own state; the address is never in it", async () => {
    state.session = interpreter(ME);
    assert.deepEqual(await get(), { status: "none" });
    state.rows[FEEDS] = [row({ lastFetchedAt: new Date("2026-11-20T10:00:00Z"), detailLevel: "generic" })];
    const active = await get();
    assert.equal(active.status, "active");
    assert.equal(active.feed?.detailLevel, "generic");
    assert.equal(active.feed?.lastFetchedAt, "2026-11-20T10:00:00.000Z");
    assert.ok(!JSON.stringify(active).includes("0".repeat(64)), "not even the hash is sent to the browser");
    state.errors[FEEDS] = pgError("42P01");
    assert.deepEqual(await get(), { status: "not_ready" });
    state.errors[FEEDS] = new Error("boom");
    assert.deepEqual(await get(), { status: "error" });
  });

  it("reads only the signed-in interpreter's active feed", async () => {
    state.session = interpreter(ME);
    await get();
    const sent = state.wheres.find((w) => w.table === FEEDS);
    assert.ok(sent);
    const { sql, params } = await renderWhere(sent.condition);
    assert.match(sql, /"interpreter_id" = \$1/);
    assert.match(sql, /"revoked_at" is null/);
    assert.deepEqual(params, [ME]);
  });
});

describe("createCalendarFeed", () => {
  it("stores only the SHA-256 of the secret, returns the address once, and audits the feed's id only", async () => {
    state.session = interpreter(ME);
    const result = await create("generic");
    assert.ok(result.success && result.url);
    const token = tokenOf(result.url);
    assert.equal(token.length, 43);
    const inserted = state.inserted.find((i) => i.table === FEEDS)?.values as Record<string, unknown>;
    assert.deepEqual(Object.keys(inserted).sort(), ["detailLevel", "interpreterId", "tokenHash"]);
    assert.equal(inserted.interpreterId, ME);
    assert.equal(inserted.detailLevel, "generic");
    assert.equal(inserted.tokenHash, hashFeedToken(token));
    assert.ok(!JSON.stringify(state.inserted).includes(token), "the secret is nowhere in what was written");
    assert.deepEqual(audits().map((a) => a.action), ["calendar_feed_created"]);
    assert.ok(!JSON.stringify(audits()).includes(token) && /^feedId=.+; level=generic$/.test(audits()[0].details));
    assert.ok(!JSON.stringify(result.state).includes(token), "the state the card keeps does not hold the secret");
  });

  it("makes a different secret every time, and refuses a second active feed and an unknown level", async () => {
    state.session = interpreter(ME);
    const a = await create("busy");
    const b = await create("busy");
    assert.ok(a.success && b.success && a.url !== b.url);
    state.rows[FEEDS] = [row()];
    reset();
    state.session = interpreter(ME);
    state.rows[FEEDS] = [row()];
    assert.deepEqual(await create("busy"), { success: false, error: "You already have a calendar link. Rotate it to get a new address." });
    assert.ok(!state.ops.includes(`insert:${FEEDS}`));
    assert.deepEqual(await create("everything"), { success: false, error: "Choose how much each event says." });
  });

  it("says plainly when migration 0016 is not on this database, and hides any other failure", async () => {
    state.session = interpreter(ME);
    state.writeErrors[FEEDS] = pgError("42P01");
    assert.deepEqual(await create("busy"), { success: false, error: "Calendar subscriptions are not set up on this database yet. Please check back soon." });
    state.writeErrors[FEEDS] = new Error("secret-detail");
    const other = await create("busy");
    assert.ok(!other.success && !other.error.includes("secret-detail"));
  });
});

describe("rotateCalendarFeed", () => {
  it("writes a new hash to the interpreter's own active feed, starts the counters over, and returns the new address once", async () => {
    state.session = interpreter(ME);
    state.returning[FEEDS] = [row({ rotatedAt: new Date() })];
    const result = await rotate();
    assert.ok(result.success && result.url);
    const set = state.updated.find((u) => u.table === FEEDS)?.set as Record<string, unknown>;
    assert.equal(set.tokenHash, hashFeedToken(tokenOf(result.url)));
    assert.equal(set.windowCount, 0);
    assert.equal(set.lastFetchedAt, null);
    assert.ok(set.rotatedAt instanceof Date);
    const { sql, params } = await renderWhere(state.wheres.find((w) => w.table === FEEDS)?.condition);
    assert.match(sql, /"interpreter_id" = \$1/);
    assert.match(sql, /"revoked_at" is null/);
    assert.deepEqual(params, [ME]);
    assert.deepEqual(audits().map((a) => a.action), ["calendar_feed_rotated"]);
    assert.ok(!JSON.stringify(audits()).includes(tokenOf(result.url)));
  });

  it("with no active feed there is nothing to rotate", async () => {
    state.session = interpreter(ME);
    state.returning[FEEDS] = [];
    assert.deepEqual(await rotate(), { success: false, error: "You do not have a calendar link yet." });
    assert.deepEqual(audits(), []);
  });
});

describe("revokeCalendarFeed and setCalendarFeedDetail", () => {
  it("revoke stamps revoked_at on the interpreter's own active feed and the card goes back to none", async () => {
    state.session = interpreter(ME);
    state.returning[FEEDS] = [row({ revokedAt: new Date() })];
    assert.deepEqual(await revoke(), { success: true, state: { status: "none" } });
    const set = state.updated.find((u) => u.table === FEEDS)?.set as Record<string, unknown>;
    assert.deepEqual(Object.keys(set), ["revokedAt"]);
    assert.deepEqual((await renderWhere(state.wheres.find((w) => w.table === FEEDS)?.condition)).params, [ME]);
    assert.deepEqual(audits().map((a) => a.action), ["calendar_feed_revoked"]);
    reset();
    state.session = interpreter(ME);
    state.returning[FEEDS] = [];
    assert.equal((await revoke()).success, false);
  });

  it("the detail level changes without a new address, only to a known level", async () => {
    state.session = interpreter(ME);
    state.returning[FEEDS] = [row({ detailLevel: "generic" })];
    const result = await setDetail("generic");
    assert.ok(result.success && result.url === undefined && result.state.feed?.detailLevel === "generic");
    assert.deepEqual(state.updated.find((u) => u.table === FEEDS)?.set, { detailLevel: "generic" });
    assert.deepEqual(audits().map((a) => a.action), ["calendar_feed_detail_changed"]);
    assert.deepEqual(await setDetail("full"), { success: false, error: "Choose how much each event says." });
  });
});
