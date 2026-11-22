import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOCKED_WHILE_BOOKED, stripLockedFields } from "@/lib/bookedEditLimits";
import { STATE_PORTAL_TIME_NOTE, bookedTimeConflict, movesSchedule, withOriginalSchedule } from "@/lib/bookedTimeEdit";
import type { ConflictCheck } from "@/lib/bookedTimeEdit";
import { buildUpdateEmail, editNotification } from "@/lib/jobUpdateNotice";
import { summarizeJob } from "@/lib/jobSummary";
import { SCHEDULE_BANNER_KINDS } from "@/lib/notifications";
import { quickEditPayload } from "@/lib/quickEditAccess";
import type { QuickEditValues } from "@/lib/quickEditAccess";
import { diffJobForInterpreter } from "@/lib/requestChanges";
import { timeChangeOf } from "@/lib/timeChange";

const ADDRESS = "4800 Sand Point Way NE, Seattle, WA 98105";
const job = (startsAt: string, endsAt: string, extra: Record<string, unknown> = {}) => ({
  id: "5a8c56a4-0000-4000-8000-000000000032",
  title: "ODHH SRN #202787460",
  createdAt: new Date(startsAt),
  data: {
    intake: { program: "WA ODHH", odhhSrn: "202787460" },
    requester: { billOrg: "Seattle Children's Hospital" },
    details: { format: "In person", setting: "Medical Provider-Medicaid", deafParticipant: "Test Client Person", timeZone: "America/Los_Angeles" },
    onsite: { venue: "OTOLARYNGOLOGY CLINIC", address: ADDRESS },
    startsAt,
    endsAt,
    ...extra,
  },
});
// Booked for 8 hours, then cut to 4 (Tue Nov 24, 2026, Pacific Time).
const BEFORE = job("2026-11-24T16:00:00.000Z", "2026-11-25T00:00:00.000Z");
const AFTER = job("2026-11-24T16:00:00.000Z", "2026-11-24T20:00:00.000Z");
const window4h = { startsAt: "2026-11-24T16:00:00.000Z", endsAt: "2026-11-24T20:00:00.000Z" };

describe("Phase 32.1: what a booked job may change", () => {
  it("keeps the date and times in the save but drops the time zone and program", () => {
    const payload = {
      startDate: "2026-11-24", startTime: "08:00", endDate: "2026-11-24", endTime: "12:00", timeZone: "Eastern Time — New York", program: "General",
      details: { startTime: "08:00", timeZone: "x" }, data: { startsAt: window4h.startsAt, timeZone: "x", intake: { program: "General", odhhSrn: "1" } },
    };
    const kept = stripLockedFields(payload) as Record<string, unknown> & typeof payload;
    for (const field of ["startDate", "startTime", "endDate", "endTime"] as const) assert.equal(kept[field], payload[field], field);
    assert.equal(kept.details.startTime, "08:00");
    assert.equal(kept.data.startsAt, window4h.startsAt);
    for (const gone of [...LOCKED_WHILE_BOOKED, "program"]) assert.ok(!(gone in kept), gone);
    assert.ok(!("timeZone" in kept.details) && !("timeZone" in kept.data));
    assert.deepEqual((kept.data as Record<string, unknown>).intake, { odhhSrn: "1" });
  });

  it("quick edit sends a booked job's new date and times with the message, never its time zone", () => {
    const values = { startDate: "2026-11-24", startTime: "08:00", endDate: "2026-11-24", endTime: "12:00", timeZone: "Pacific Time — Seattle, Los Angeles" } as QuickEditValues;
    const booked = quickEditPayload("r1", values, true, "See you there", "terp-1");
    assert.equal(booked.endTime, "12:00");
    assert.equal(booked.startDate, "2026-11-24");
    assert.equal(booked.timeZone, undefined);
    assert.equal(booked.messageToInterpreter, "See you there");
    assert.equal(quickEditPayload("r1", values, false, "", "").timeZone, values.timeZone);
  });

  it("the State portal note is the agreed wording, without an em-dash", () => {
    assert.equal(STATE_PORTAL_TIME_NOTE, "Updating times here notifies booked interpreters and updates your calendar, but does not update the State portal.");
    assert.ok(!STATE_PORTAL_TIME_NOTE.includes("—"));
  });
});

describe("Phase 32.1: the conflict check for every booked interpreter", () => {
  const names: Record<string, string> = { "terp-a": "Alex Interpreter", "terp-b": "Blair Interpreter" };
  const nameOf = async (id: string) => names[id] ?? null;
  const booked = [{ interpreterId: "terp-a" }, { interpreterId: "terp-b" }, { interpreterId: "terp-a" }];

  it("saves when everyone is free, checking each interpreter once against the new window and ignoring this job", async () => {
    const seen: Parameters<ConflictCheck>[0][] = [];
    const check: ConflictCheck = async (p) => (seen.push(p), { hasConflict: false });
    assert.equal(await bookedTimeConflict({ requestId: "req-1", booked, window: window4h }, { check, nameOf }), null);
    assert.deepEqual(seen.map((p) => p.interpreterId), ["terp-a", "terp-b"]);
    for (const p of seen) assert.deepEqual([p.startsAtUtc, p.endsAtUtc, p.excludeRequestId], [window4h.startsAt, window4h.endsAt, "req-1"]);
  });

  it("blocks the save and names the interpreter with the other booking or busy time", async () => {
    const busyB: ConflictCheck = async (p) => (p.interpreterId === "terp-b" ? { hasConflict: true, reason: "busy" } : { hasConflict: false });
    const busy = await bookedTimeConflict({ requestId: "req-1", booked, window: window4h }, { check: busyB, nameOf });
    assert.equal(busy, "Blair Interpreter has marked that time as busy, so the new time was not saved. Choose another time, or remove their booking first.");
    const jobA: ConflictCheck = async () => ({ hasConflict: true, reason: "job" });
    assert.match((await bookedTimeConflict({ requestId: "req-1", booked, window: window4h }, { check: jobA, nameOf })) ?? "", /^Alex Interpreter has another booking at that time/);
    const unnamed = await bookedTimeConflict({ requestId: "req-1", booked: [{ interpreterId: "x" }], window: window4h }, { check: jobA, nameOf: async () => { throw new Error("db"); } });
    assert.match(unnamed ?? "", /^A booked interpreter has another booking/);
  });
});

describe("Phase 32.1: the original booked window is kept for billing", () => {
  const change = timeChangeOf(BEFORE, window4h);

  it("is written on the first move of a booked job", () => {
    assert.ok(change);
    const data = withOriginalSchedule({ startsAt: window4h.startsAt }, change, true);
    assert.equal(data.originalScheduledStart, "2026-11-24T16:00:00.000Z");
    assert.equal(data.originalScheduledEnd, "2026-11-25T00:00:00.000Z");
  });

  it("is never overwritten by a later move, and not written for an unbooked job or an unchanged time", () => {
    const first = { originalScheduledStart: "2026-11-20T16:00:00.000Z", originalScheduledEnd: "2026-11-21T00:00:00.000Z" };
    assert.deepEqual(withOriginalSchedule({ ...first }, change, true), first);
    assert.deepEqual(withOriginalSchedule({ a: 1 }, change, false), { a: 1 });
    assert.deepEqual(withOriginalSchedule({ a: 1 }, null, true), { a: 1 });
  });
});

describe("Phase 32.2: telling the booked interpreter", () => {
  const changes = diffJobForInterpreter(BEFORE, AFTER);
  const booking = { offerId: "offer-9", position: 1 as const };

  it("a shortened booking shows as a Time change", () => {
    assert.ok(movesSchedule(changes));
    assert.ok(changes.some((c) => c.field === "Time" && c.emailSafe));
    assert.ok(!movesSchedule([{ field: "Venue" }]));
  });

  it("is a Schedule updated banner naming the job's header and its new date and time", () => {
    assert.ok((SCHEDULE_BANNER_KINDS as readonly string[]).includes("booking_time_changed"));
    const notice = editNotification(AFTER, booking, changes, false);
    const s = summarizeJob(AFTER, 1);
    assert.equal(notice.kind, "booking_time_changed");
    assert.equal(notice.title, "Schedule updated");
    assert.equal(notice.href, "/jobs/offer-9");
    assert.ok(notice.message.includes("202787460") && notice.message.includes(`moved to ${s.dateLabel} at ${s.timeLabel}.`), notice.message);
    assert.ok(!`${notice.title}${notice.message}`.includes("—"));
    assert.ok(editNotification(AFTER, booking, changes, true).message.endsWith("The agency also sent you a message."));
  });

  it("any other change stays a bell-only notice", () => {
    const venueOnly = editNotification(AFTER, booking, [{ field: "Venue", from: "a", to: "b", emailSafe: false }], false);
    assert.equal(venueOnly.kind, undefined);
    assert.equal(venueOnly.title, "Job details updated");
  });

  it("the Job details updated email quotes the old and new time and nothing about the client or place", () => {
    const email = buildUpdateEmail(summarizeJob(AFTER, 1), changes, "https://x.test/job-details?token=t");
    const all = `${email.subject}${email.html}${email.text}`;
    const time = changes.find((c) => c.field === "Time");
    assert.ok(time && email.text.includes(`Time changed from ${time.from} to ${time.to}`), email.text);
    assert.ok(email.subject.startsWith("Job details updated"));
    for (const never of [ADDRESS, "OTOLARYNGOLOGY", "Test Client Person", "202787460", "Medicaid"]) assert.ok(!all.includes(never), never);
  });
});
