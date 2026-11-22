import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invalidateKey, readEntry, revalidate, subscribe } from "@/lib/clientCache";
import { cleanRequestId, hasScheduleConflict } from "@/lib/fitConflict";
import type { ConflictLookup } from "@/lib/fitConflict";
import { offersFitKey } from "@/lib/offersFitKey";
import { sweepDue } from "@/lib/offerPulseSweep";
import { MAX_TOASTS, PULSE_INTERVAL_MS, capToasts, nextToasts, pulseSignature } from "@/lib/pulse";
import type { AlertToast, Pulse } from "@/lib/pulse";
import { WAKE_THROTTLE_MS, createPulseStore } from "@/lib/pulseStore";
import type { PulseEnv } from "@/lib/pulseStore";

const pulse = (over: Partial<Pulse> = {}): Pulse => ({ latestId: "n1", latestAt: "2026-11-23T20:00:00.000Z", unread: 1, openOffers: 2, openQuestions: 0, serverNow: "2026-11-23T20:00:05.000Z", ...over });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A fake browser: a visible flag, a clock, the 15-second timer and the focus listeners, all driven by hand. */
function harness(answers: (Pulse | null)[]) {
  const state = { visible: true, nowMs: 100_000, fetches: 0, delay: null as Promise<void> | null };
  const timers = new Set<() => void>();
  const wakes = new Set<() => void>();
  const changed: Pulse[] = [];
  const intervals: number[] = [];
  const env: PulseEnv = {
    fetchPulse: async () => {
      const answer = answers[Math.min(state.fetches, answers.length - 1)];
      state.fetches += 1;
      if (state.delay) await state.delay;
      return answer;
    },
    isVisible: () => state.visible,
    every: (fn, ms) => (intervals.push(ms), timers.add(fn), () => void timers.delete(fn)),
    onWake: (fn) => (wakes.add(fn), () => void wakes.delete(fn)),
    now: () => state.nowMs,
    onChange: (p) => void changed.push(p),
  };
  return { state, env, timers, wakes, changed, intervals, fire: () => timers.forEach((fn) => fn()), wake: () => wakes.forEach((fn) => fn()) };
}

describe("the pulse (Phase 33.3)", () => {
  it("changes when a notification, the unread count, or the open offers or questions change, and not for the clock", () => {
    const base = pulse();
    assert.equal(pulseSignature(base), pulseSignature(pulse({ serverNow: "2026-11-23T21:00:00.000Z", latestAt: "2026-11-23T20:00:01.000Z" })));
    for (const over of [{ latestId: "n2" }, { unread: 2 }, { openOffers: 1 }, { openQuestions: 1 }, { latestId: null }]) assert.notEqual(pulseSignature(base), pulseSignature(pulse(over)), JSON.stringify(over));
    assert.equal(PULSE_INTERVAL_MS, 15_000);
  });

  it("carries counts and ids only: no names, no job details", () => {
    assert.deepEqual(Object.keys(pulse()).sort(), ["latestAt", "latestId", "openOffers", "openQuestions", "serverNow", "unread"]);
  });
});

describe("the poller: 15 seconds while visible, and on focus", () => {
  it("reads at once, then every 15 seconds, and keeps the first answer without telling anyone", async () => {
    const h = harness([pulse()]);
    const store = createPulseStore(h.env);
    let told = 0;
    const stop = store.subscribe(() => void (told += 1));
    await tick();
    assert.equal(h.state.fetches, 1);
    assert.deepEqual(h.intervals, [15_000]);
    assert.equal(store.getSnapshot().pulse?.latestId, "n1");
    assert.equal(store.getSnapshot().changes, 0);
    assert.equal(told, 1, "the first answer is shown");
    h.fire();
    await tick();
    assert.equal(h.state.fetches, 2);
    assert.equal(told, 1, "an unchanged pulse re-renders nothing");
    assert.equal(store.getSnapshot().changes, 0);
    stop();
  });

  it("counts a change, runs onChange once, and tells every listener", async () => {
    const h = harness([pulse(), pulse({ latestId: "n2", unread: 2 }), pulse({ latestId: "n2", unread: 2 })]);
    const store = createPulseStore(h.env);
    let told = 0;
    store.subscribe(() => void (told += 1));
    store.subscribe(() => void (told += 1));
    await tick();
    h.fire();
    await tick();
    assert.equal(store.getSnapshot().changes, 1);
    assert.equal(h.changed.length, 1);
    assert.equal(h.changed[0].latestId, "n2");
    assert.equal(told, 4);
    h.fire();
    await tick();
    assert.equal(store.getSnapshot().changes, 1, "the same answer again is not a change");
    assert.equal(h.timers.size, 1, "two subscribers share one timer");
  });

  it("reads nothing while the tab is hidden, and reads at once when it comes back, at most every 2 seconds", async () => {
    const h = harness([pulse(), pulse({ openOffers: 5 })]);
    const store = createPulseStore(h.env);
    store.subscribe(() => undefined);
    await tick();
    h.state.visible = false;
    h.fire();
    h.wake();
    await tick();
    assert.equal(h.state.fetches, 1, "hidden: no read from the timer or a focus");
    h.state.visible = true;
    h.wake();
    await tick();
    assert.equal(h.state.fetches, 2, "visible again: a read straight away");
    assert.equal(store.getSnapshot().pulse?.openOffers, 5);
    h.state.nowMs += WAKE_THROTTLE_MS - 1;
    h.wake();
    await tick();
    assert.equal(h.state.fetches, 2, "a second focus within 2 s is ignored");
    h.state.nowMs += 2;
    h.wake();
    await tick();
    assert.equal(h.state.fetches, 3);
  });

  it("skips a read while one is still under way, keeps the last answer when a read fails, and stops when nobody listens", async () => {
    const h = harness([pulse(), null]);
    const store = createPulseStore(h.env);
    const stop = store.subscribe(() => undefined);
    await tick();
    let release!: () => void;
    h.state.delay = new Promise<void>((resolve) => (release = resolve));
    h.fire();
    h.fire();
    await tick();
    assert.equal(h.state.fetches, 2, "two overlapping ticks make one read");
    release();
    await tick();
    assert.equal(store.getSnapshot().pulse?.latestId, "n1", "a failed (null) read keeps what was shown");
    assert.equal(store.getSnapshot().changes, 0);
    stop();
    assert.equal(h.timers.size, 0);
    assert.equal(h.wakes.size, 0);
  });
});

describe("pop-ups for new alerts", () => {
  const toast = (id: string, createdAt: string): AlertToast => ({ id, kind: "offer_declined", title: "Offer declined", message: "An interpreter declined.", href: "/requests/x#staffing", createdAt });

  it("shows each alert once, oldest first, and only moves the cursor forward", () => {
    const seen = new Set(["a"]);
    const { fresh, cursor } = nextToasts([toast("c", "2026-11-23T20:00:03.000Z"), toast("a", "2026-11-23T20:00:01.000Z"), toast("b", "2026-11-23T20:00:02.000Z")], seen, "2026-11-23T20:00:00.000Z");
    assert.deepEqual(fresh.map((t) => t.id), ["b", "c"]);
    assert.equal(cursor, "2026-11-23T20:00:03.000Z");
    assert.equal(nextToasts([], seen, "2026-11-23T20:00:03.000Z").cursor, "2026-11-23T20:00:03.000Z");
    assert.equal(nextToasts([toast("z", "2026-11-23T19:00:00.000Z")], new Set(), "2026-11-23T20:00:03.000Z").cursor, "2026-11-23T20:00:03.000Z");
  });

  it("keeps only the newest few on screen", () => {
    const list = Array.from({ length: 5 }, (_, i) => i);
    assert.deepEqual(capToasts(list), list.slice(5 - MAX_TOASTS));
    assert.deepEqual(capToasts([1], 3), [1]);
  });
});

describe("the cache: a per-key invalidate", () => {
  it("makes a fresh answer stale, tells its screens, and the next read ignores the just-read window", async () => {
    const key = "user-1:dashboard-summary";
    let reads = 0;
    const fetcher = async () => ++reads;
    let heard = 0;
    const off = subscribe(key, () => void (heard += 1));
    await revalidate(key, fetcher);
    await revalidate(key, fetcher);
    assert.equal(reads, 1, "two reads a moment apart are one read");
    const before = heard;
    invalidateKey("dashboard-summary");
    assert.equal(readEntry(key)?.stale, true);
    assert.equal(readEntry<number>(key)?.data, 1, "what is shown stays until the new answer arrives");
    assert.ok(heard > before, "the screen is told");
    await revalidate(key, fetcher);
    assert.equal(reads, 2, "a stale answer is read again at once");
    assert.equal(readEntry(key)?.stale, undefined);
    off();
  });

  it("leaves other keys alone", async () => {
    await revalidate("user-1:other-key", async () => "kept");
    invalidateKey("dashboard-summary");
    assert.equal(readEntry("user-1:other-key")?.stale, undefined);
    invalidateKey("no-such-key");
  });
});

describe("availability: the job's own bookings never count against it (Phase 33.3)", () => {
  const window = { startsAtUtc: new Date("2026-11-24T16:00:00Z"), endsAtUtc: new Date("2026-11-24T20:00:00Z") };
  const REQUEST = "5a8c56a4-0000-4000-8000-000000000033";

  it("passes the job's id to every conflict lookup", async () => {
    const seen: Parameters<ConflictLookup>[0][] = [];
    const lookup: ConflictLookup = async (p) => (seen.push(p), { hasConflict: false });
    assert.equal(await hasScheduleConflict({ interpreterIds: ["a", "b"], ...window, excludeRequestId: REQUEST }, lookup), false);
    assert.deepEqual(seen.map((p) => [p.interpreterId, p.excludeRequestId]), [["a", REQUEST], ["b", REQUEST]]);
  });

  it("an interpreter whose only booking is this job is free for it; another booking still blocks", async () => {
    // A stand-in for td_conflict: the interpreter holds this job (accepted) and, in the second case, also another one.
    const lookupFor = (bookings: string[]): ConflictLookup => async ({ excludeRequestId }) => ({ hasConflict: bookings.some((id) => id !== excludeRequestId) });
    assert.equal(await hasScheduleConflict({ interpreterIds: ["a"], ...window, excludeRequestId: REQUEST }, lookupFor([REQUEST])), false);
    assert.equal(await hasScheduleConflict({ interpreterIds: ["a"], ...window }, lookupFor([REQUEST])), true, "without the id (the old call) it clashed with itself");
    assert.equal(await hasScheduleConflict({ interpreterIds: ["a"], ...window, excludeRequestId: REQUEST }, lookupFor([REQUEST, "another-job"])), true);
  });

  it("stops at the first interpreter id that conflicts", async () => {
    let calls = 0;
    const lookup: ConflictLookup = async () => ({ hasConflict: ++calls === 2 });
    assert.equal(await hasScheduleConflict({ interpreterIds: ["a", "b", "c"], ...window }, lookup), true);
    assert.equal(calls, 2);
  });

  it("only a real request id is used", () => {
    assert.equal(cleanRequestId(REQUEST), REQUEST);
    for (const bad of ["", "not-an-id", "1; drop table requests", 42, null, undefined]) assert.equal(cleanRequestId(bad), undefined);
  });

  it("Staffing re-checks when who holds which offer changes", () => {
    const a = offersFitKey([{ id: "o1", status: "pending" }, { id: "o2", status: "accepted" }]);
    assert.equal(a, offersFitKey([{ id: "o2", state: "accepted" }, { id: "o1", status: "pending" }]), "order does not matter");
    assert.notEqual(a, offersFitKey([{ id: "o1", status: "declined" }, { id: "o2", status: "accepted" }]));
    assert.notEqual(a, offersFitKey([{ id: "o2", status: "accepted" }]));
    assert.equal(offersFitKey(undefined), "");
  });
});

describe("the expired-offer sweep from the pulse is throttled to once a minute", () => {
  it("is due only after a full minute", () => {
    assert.equal(sweepDue(1_000_000, 1_000_000 - 59_999), false);
    assert.equal(sweepDue(1_000_000, 1_000_000 - 60_000), true);
    assert.equal(sweepDue(1_000_000, 0), true);
  });
});
