import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  appointmentsOnDay,
  bookedAppointments,
  busyBlocksOnDay,
  formatBusyBlockTimes,
  formatEventTimes,
  parseSafeIso,
  personalJobBlocks,
  sortLiveFirst,
} from "@/lib/interpreterCalendar";
import type { CalendarAppointment, CalendarBusyBlock } from "@/lib/interpreterCalendar";

(globalThis as { React?: typeof React }).React = React;

const ZONE = "America/Los_Angeles";
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

const appt = (id: string, startsAt: string, endsAt: string, title = `Job ${id}`): CalendarAppointment => ({
  id, startsAt, endsAt, start: new Date(startsAt), end: new Date(endsAt), title, agencyName: "Agency", status: "booked",
});
const block = (id: string, start: string, end: string, label = "Busy"): CalendarBusyBlock => ({ id, label, timeZone: ZONE, isAllDay: false, start, end });

// Monday 2026-12-07: 9:00 to 10:00 Pacific is 17:00 to 18:00 UTC.
const NINE = appt("a1", "2026-12-07T17:00:00.000Z", "2026-12-07T18:00:00.000Z", "Clinic visit");
const NOON_BLOCK = block("b1", "2026-12-07T20:00:00.000Z", "2026-12-07T21:00:00.000Z", "Dentist");
const NOON_MS = Date.parse("2026-12-07T12:00:00Z");

describe("the interpreter calendar's pure helpers", () => {
  it("reads loose dates and says null for anything that is not one", () => {
    assert.equal(parseSafeIso("2026-12-07 09:00"), new Date("2026-12-07T09:00").toISOString());
    assert.equal(parseSafeIso("2026-12-07T17:00:00.000Z"), "2026-12-07T17:00:00.000Z");
    assert.equal(parseSafeIso("nope"), null);
    assert.equal(parseSafeIso(null), null);
    assert.equal(parseSafeIso(undefined), null);
  });

  it("lists only booked or accepted jobs, leaves test jobs out, and fills in missing times and names", () => {
    const list = bookedAppointments([
      { id: "1", status: "booked", title: "Real job", startsAt: "2026-12-07T17:00:00.000Z", endsAt: "2026-12-07T18:30:00.000Z", agencyName: "Agency A", timeZone: "America/Denver" },
      { id: "2", status: "ACCEPTED", startsAt: "2026-12-08T17:00:00.000Z" },
      { id: "3", status: "pending", startsAt: "2026-12-09T17:00:00.000Z" },
      { id: "fictional-4", status: "booked", startsAt: "2026-12-10T17:00:00.000Z" },
      { id: "5", status: "booked", title: "A Fictional visit", startsAt: "2026-12-11T17:00:00.000Z" },
      { id: "6", status: "booked", location: "Harbor Clinic", details: { startDate: "2026-12-12", startTime: "09:00", endDate: "2026-12-12", endTime: "10:00" } },
    ]);
    assert.deepEqual(list.map((a) => a.id), ["1", "2", "6"]);
    assert.equal(list[0].endsAt, "2026-12-07T18:30:00.000Z");
    assert.equal(list[0].timeZone, "America/Denver");
    assert.equal(list[1].title, "Interpreting request");
    assert.equal(list[1].endsAt, "2026-12-08T18:00:00.000Z", "one hour when there is no end");
    assert.equal(list[1].requestId, "2");
    assert.equal(list[2].agencyName, "Harbor Clinic");
    assert.equal(list[2].startsAt, new Date("2026-12-12T09:00").toISOString());
    assert.equal(list[2].endsAt, new Date("2026-12-12T10:00").toISOString());
  });

  it("writes times in the calendar's zone, and All day for a block that runs midnight to midnight", () => {
    assert.equal(formatEventTimes(ZONE, NINE.startsAt, NINE.endsAt), "9:00 AM – 10:00 AM PST");
    assert.equal(formatBusyBlockTimes(ZONE, NOON_BLOCK), "12:00 PM – 1:00 PM PST");
    assert.equal(formatBusyBlockTimes(ZONE, block("d", "2026-12-07T08:00:00.000Z", "2026-12-08T08:00:00.000Z")), "All day · PST");
    assert.equal(formatBusyBlockTimes(ZONE, { ...NOON_BLOCK, isAllDay: true }), "All day · PST");
  });

  it("picks the items on a calendar day in the calendar's zone, not in UTC", () => {
    const late = appt("late", "2026-12-08T03:00:00.000Z", "2026-12-08T04:00:00.000Z");
    assert.deepEqual(appointmentsOnDay([NINE, late], ZONE, "2026-12-07").map((a) => a.id), ["a1", "late"], "7 PM Dec 7 Pacific is Dec 8 in UTC");
    assert.deepEqual(appointmentsOnDay([NINE, late], ZONE, "2026-12-08"), []);
    assert.deepEqual(busyBlocksOnDay([NOON_BLOCK], ZONE, "2026-12-07").map((b) => b.id), ["b1"]);
    assert.deepEqual(busyBlocksOnDay([NOON_BLOCK], ZONE, "2026-12-06"), []);
  });

  it("puts what is happening now first, then orders by start time", () => {
    const earlier = appt("e", "2026-12-07T15:00:00.000Z", "2026-12-07T16:00:00.000Z");
    const live = appt("live", "2026-12-07T19:00:00.000Z", "2026-12-07T21:00:00.000Z");
    const now = Date.parse("2026-12-07T20:00:00Z");
    assert.deepEqual(sortLiveFirst([NINE, live, earlier], now).map((a) => a.id), ["live", "e", "a1"]);
    assert.deepEqual(sortLiveFirst([NINE, live, earlier], NOON_MS).map((a) => a.id), ["e", "a1", "live"]);
  });
});

describe("the calendar views", () => {
  const common = { currentDate: new Date(2026, 11, 7, 12), appointments: [NINE], busyBlocks: [NOON_BLOCK], personalJobs: [] as CalendarBusyBlock[], zone: ZONE, currentTime: NOON_MS, onOpenJob: () => undefined };

  it("the month grid has a cell per day, the weekday headers, and the day's booking and busy time", async () => {
    const { CalendarMonthView } = await import("@/components/calendar/interpreter/CalendarMonthView");
    const html = renderToStaticMarkup(React.createElement(CalendarMonthView, common));
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) assert.ok(html.includes(`>${day}<`), day);
    assert.ok(html.includes("Clinic visit") && html.includes("9:00 AM – 10:00 AM PST"));
    assert.ok(html.includes("Dentist") && html.includes("12:00 PM – 1:00 PM PST"));
    assert.equal((html.match(/min-h-\[130px\]/g) ?? []).length, 5, "December 2026 spans five weeks");
    assert.ok(!html.includes("Live now"));
  });

  it("the month grid marks a booking that is happening now", async () => {
    const { CalendarMonthView } = await import("@/components/calendar/interpreter/CalendarMonthView");
    const html = renderToStaticMarkup(React.createElement(CalendarMonthView, { ...common, currentTime: Date.parse("2026-12-07T17:30:00Z") }));
    assert.ok(html.includes("Live now") && html.includes("bg-emerald-600"));
  });

  it("the week grid places a booking by its start minute and length, and a busy block likewise", async () => {
    const { CalendarWeekView } = await import("@/components/calendar/interpreter/CalendarWeekView");
    const html = renderToStaticMarkup(React.createElement(CalendarWeekView, { ...common, onSlotClick: () => undefined }));
    assert.ok(html.includes("top:540px;height:60px"), "9:00 AM is minute 540, one hour is 60px");
    assert.ok(html.includes("top:720px;height:60px"), "the 12:00 PM busy block");
    assert.ok(html.includes("12/6") && html.includes("12/12"), "Sunday Dec 6 to Saturday Dec 12");
    assert.ok(html.includes("12 AM") && html.includes("11 PM"));
  });

  it("the week grid stretches a busy block that ends at or before its start to midnight, and gives short jobs a minimum height", async () => {
    const { CalendarWeekView } = await import("@/components/calendar/interpreter/CalendarWeekView");
    const overnight = block("n", "2026-12-08T05:00:00.000Z", "2026-12-08T06:00:00.000Z");
    const quick = appt("q", "2026-12-07T17:00:00.000Z", "2026-12-07T17:10:00.000Z");
    const html = renderToStaticMarkup(React.createElement(CalendarWeekView, { ...common, appointments: [quick], busyBlocks: [{ ...overnight, end: "2026-12-08T04:00:00.000Z" }], onSlotClick: () => undefined }));
    assert.ok(html.includes("top:540px;height:36px"), "a 10 minute job is at least 36px tall");
    assert.ok(html.includes("top:1260px;height:180px"), "9 PM start, end before start: runs to midnight (1440 - 1260)");
  });

  it("the day agenda lists the booking and the busy time, or says nothing is scheduled", async () => {
    const { CalendarDayView } = await import("@/components/calendar/interpreter/CalendarDayView");
    const html = renderToStaticMarkup(React.createElement(CalendarDayView, { ...common, onBlockTime: () => undefined }));
    assert.ok(html.includes("Monday, December 7, 2026") && html.includes("Clinic visit") && html.includes("Dentist"));
    assert.ok(html.includes("Block time on this day"));
    const empty = renderToStaticMarkup(React.createElement(CalendarDayView, { ...common, appointments: [], busyBlocks: [], onBlockTime: () => undefined }));
    assert.ok(empty.includes("Nothing scheduled for this day."));
  });
});

describe("personal jobs on the interpreter's own calendar", () => {
  const PERSONAL = block("pj1", "2026-12-07T21:00:00.000Z", "2026-12-07T22:30:00.000Z", "Community class");
  const withPersonal = { currentDate: new Date(2026, 11, 7, 12), appointments: [NINE], busyBlocks: [NOON_BLOCK], personalJobs: [PERSONAL], zone: ZONE, currentTime: NOON_MS, onOpenJob: () => undefined };

  it("turns the view's personal jobs into blocks, with their label or else Personal job", () => {
    assert.deepEqual(personalJobBlocks([
      { id: "a", label: "Class", startsAt: "2026-12-07T21:00:00.000Z", endsAt: "2026-12-07T22:00:00.000Z", timeZone: "America/Denver" },
      { id: "b", label: "", startsAt: "2026-12-08T21:00:00.000Z", endsAt: "2026-12-08T22:00:00.000Z", timeZone: ZONE },
    ]), [
      { id: "a", label: "Class", timeZone: "America/Denver", isAllDay: false, start: "2026-12-07T21:00:00.000Z", end: "2026-12-07T22:00:00.000Z" },
      { id: "b", label: "Personal job", timeZone: ZONE, isAllDay: false, start: "2026-12-08T21:00:00.000Z", end: "2026-12-08T22:00:00.000Z" },
    ]);
    assert.deepEqual(personalJobBlocks([]), []);
  });

  it("the month grid draws one in the theme's tint, apart from busy time, with its times, and it is not clickable", async () => {
    const { CalendarMonthView } = await import("@/components/calendar/interpreter/CalendarMonthView");
    const html = renderToStaticMarkup(React.createElement(CalendarMonthView, withPersonal));
    const mine = html.slice(html.indexOf('data-personal-job="pj1"'));
    assert.ok(mine.includes("Community class") && mine.includes("1:00 PM – 2:30 PM PST"));
    assert.ok(html.includes("bg-[var(--tint)]") && html.includes("Dentist"), "busy time is still there, drawn differently");
    const tag = html.slice(html.lastIndexOf("<div", html.indexOf('data-personal-job="pj1"')), html.indexOf(">", html.indexOf('data-personal-job="pj1"')) + 1);
    assert.ok(!tag.includes("cursor-pointer") && !tag.includes("onClick"), "read only");
  });

  it("the week grid places it by its start minute and length (1:00 PM is minute 780, 90 minutes tall)", async () => {
    const { CalendarWeekView } = await import("@/components/calendar/interpreter/CalendarWeekView");
    const html = renderToStaticMarkup(React.createElement(CalendarWeekView, { ...withPersonal, onSlotClick: () => undefined }));
    assert.match(html, /data-personal-job="pj1"[^>]*style="top:780px;height:90px"/);
    assert.ok(html.includes("top:720px;height:60px"), "the busy block is still placed too");
  });

  it("the day agenda lists it, says Personal job, and the empty message does not show when it is the only entry", async () => {
    const { CalendarDayView } = await import("@/components/calendar/interpreter/CalendarDayView");
    const html = renderToStaticMarkup(React.createElement(CalendarDayView, { ...withPersonal, onBlockTime: () => undefined }));
    assert.ok(html.includes("Community class") && html.includes("Personal job · 1:00 PM – 2:30 PM PST"));
    const only = renderToStaticMarkup(React.createElement(CalendarDayView, { ...withPersonal, appointments: [], busyBlocks: [], onBlockTime: () => undefined }));
    assert.ok(only.includes("Community class") && !only.includes("Nothing scheduled for this day."));
  });

  it("a label that is missing reads Personal job in every view", async () => {
    const { CalendarDayView } = await import("@/components/calendar/interpreter/CalendarDayView");
    const unlabeled = personalJobBlocks([{ id: "x", label: "", startsAt: "2026-12-07T21:00:00.000Z", endsAt: "2026-12-07T22:00:00.000Z", timeZone: ZONE }]);
    const html = renderToStaticMarkup(React.createElement(CalendarDayView, { ...withPersonal, personalJobs: unlabeled, onBlockTime: () => undefined }));
    assert.ok(html.includes(">Personal job<"));
  });
});

describe("the files of the calendar split", () => {
  it("are each under 300 lines, hold no any and no em-dash", () => {
    const files = [
      ["src", "app", "(interpreter)", "interpreter-calendar", "page.tsx"],
      ["src", "hooks", "useInterpreterCalendar.ts"],
      ["src", "lib", "interpreterCalendar.ts"],
      ["src", "components", "calendar", "interpreter", "CalendarMonthView.tsx"],
      ["src", "components", "calendar", "interpreter", "CalendarWeekView.tsx"],
      ["src", "components", "calendar", "interpreter", "CalendarDayView.tsx"],
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
