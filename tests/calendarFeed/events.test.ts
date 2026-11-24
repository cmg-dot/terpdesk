import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENCY_JOB_TITLE, BUSY_TITLE, FEED_DAYS_AHEAD, FEED_DAYS_BACK, PERSONAL_JOB_TITLE, agencyEvent, busyEvent, eventsInWindow, feedWindow, isFeedDetailLevel, personalEvent } from "@/lib/calendarFeed/events";
import type { IcsEvent } from "@/lib/calendarFeed/ics";
import { GENERIC_SETTINGS } from "@/lib/genericSetting";

const NOW = new Date("2026-12-07T12:00:00Z");
const DAY = 86_400_000;
const when = (days: number, hours = 1) => ({ startsAt: new Date(NOW.getTime() + days * DAY), endsAt: new Date(NOW.getTime() + days * DAY + hours * 3_600_000) });

describe("what an event may say", () => {
  const job = { offerId: "o1", ...when(1), rawSetting: "Medical Provider-Medicaid at Seattle Children's", updatedAt: new Date("2026-11-01T00:00:00Z") };
  const personal = { id: "p1", ...when(2), setting: "Legal", updatedAt: new Date("2026-11-01T00:00:00Z") };

  it("busy level: only the three fixed phrases", () => {
    assert.equal(agencyEvent(job, "busy").summary, AGENCY_JOB_TITLE);
    assert.equal(personalEvent(personal, "busy").summary, PERSONAL_JOB_TITLE);
    assert.equal(busyEvent({ id: "b1", ...when(3), revision: 1 }).summary, BUSY_TITLE);
    assert.deepEqual([AGENCY_JOB_TITLE, PERSONAL_JOB_TITLE, BUSY_TITLE], ["terpDESK job", "Personal job", "Busy"]);
  });

  it("generic level: one category from the fixed list, never the form's own words", () => {
    const summary = agencyEvent(job, "generic").summary;
    assert.equal(summary, "terpDESK job: Medical");
    assert.ok(!summary.includes("Seattle") && !summary.includes("Medicaid"));
    assert.equal(personalEvent(personal, "generic").summary, "Personal job: Legal");
    for (const raw of ["Job Interview", "MEDICAID COVERED SERVICE", "court hearing", "something odd", "", "Mental health intake"]) {
      const category = agencyEvent({ ...job, rawSetting: raw }, "generic").summary.replace("terpDESK job: ", "");
      assert.ok((GENERIC_SETTINGS as readonly string[]).includes(category), `${raw} -> ${category}`);
    }
  });

  it("a personal job with no setting keeps its plain title even at the generic level; busy time never names anything", () => {
    assert.equal(personalEvent({ ...personal, setting: "" }, "generic").summary, "Personal job");
    assert.equal(busyEvent({ id: "b1", ...when(3), revision: 1 }).summary, "Busy");
  });

  it("has stable ids per kind, so a calendar app updates an event instead of duplicating it", () => {
    assert.equal(agencyEvent(job, "busy").uid, "job-o1@terpdesk");
    assert.equal(personalEvent(personal, "busy").uid, "personal-p1@terpdesk");
    assert.equal(busyEvent({ id: "b1", ...when(3), revision: 1 }).uid, "busy-b1@terpdesk");
    assert.equal(agencyEvent(job, "busy").uid, agencyEvent(job, "generic").uid, "the detail level never changes the id");
  });

  it("raises SEQUENCE when the thing changes (seconds of its update time; a busy block's revision)", () => {
    const later = agencyEvent({ ...job, updatedAt: new Date("2026-11-02T00:00:00Z") }, "busy");
    assert.ok(later.sequence > agencyEvent(job, "busy").sequence);
    assert.equal(busyEvent({ id: "b1", ...when(3), revision: 7 }).sequence, 7);
  });

  it("knows the two detail levels and nothing else", () => {
    assert.ok(isFeedDetailLevel("busy") && isFeedDetailLevel("generic"));
    for (const bad of ["Busy", "full", "", null, undefined, 1]) assert.ok(!isFeedDetailLevel(bad));
  });
});

describe("the window", () => {
  const ev = (uid: string, range: { startsAt: Date; endsAt: Date }): IcsEvent => ({ uid, ...range, summary: "x", modified: NOW, sequence: 0 });

  it("reaches 30 days back and 180 days ahead", () => {
    const { from, to } = feedWindow(NOW);
    assert.equal(FEED_DAYS_BACK, 30);
    assert.equal(FEED_DAYS_AHEAD, 180);
    assert.equal(from.getTime(), NOW.getTime() - 30 * DAY);
    assert.equal(to.getTime(), NOW.getTime() + 180 * DAY);
  });

  it("keeps what overlaps it, drops what is entirely outside, and lists soonest first (ties by id)", () => {
    const kept = eventsInWindow([
      ev("late", when(170)), ev("gone-ahead", when(181)), ev("early", when(-29)), ev("gone-back", when(-31)),
      ev("straddles-back", { startsAt: new Date(NOW.getTime() - 31 * DAY), endsAt: new Date(NOW.getTime() - 29 * DAY) }),
      ev("b-tie", when(5)), ev("a-tie", when(5)),
    ], NOW).map((e) => e.uid);
    assert.deepEqual(kept, ["straddles-back", "early", "a-tie", "b-tie", "late"]);
  });

  it("leaves out an event with an unusable time range (end not after start, or not a date)", () => {
    const bad = [
      ev("zero", { startsAt: NOW, endsAt: NOW }), ev("backwards", { startsAt: new Date(NOW.getTime() + DAY), endsAt: NOW }), ev("nan", { startsAt: new Date("nope"), endsAt: NOW }),
    ];
    assert.deepEqual(eventsInWindow(bad, NOW), []);
  });
});
