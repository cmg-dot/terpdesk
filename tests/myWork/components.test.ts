import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hoursLabel, personalJobFormValues, personalJobWhen, toPersonalJobView, emptyPersonalJobForm } from "@/lib/personalJobs";
import type { PersonalJobRecord, PersonalJobView } from "@/lib/personalJobs";
import { LABEL_HINT } from "@/lib/validation/personalJob";

(globalThis as { React?: typeof React }).React = React;

const EM_DASH = String.fromCharCode(0x2014);
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
const NOW = Date.parse("2026-12-07T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000);

const record = (over: Partial<PersonalJobRecord> = {}): PersonalJobRecord => ({
  id: "11111111-1111-4111-8111-111111111111", label: null, setting: null, startsAt: new Date("2026-12-07T17:00:00Z"), endsAt: new Date("2026-12-07T19:30:00Z"),
  timeZone: "America/Los_Angeles", breakMinutes: 30, miles: null, roundTrip: false, countedMiles: null, ...over,
});
const view = (over: Partial<PersonalJobRecord> = {}): PersonalJobView => toPersonalJobView(record(over));
const at = (id: string, daysAgo: number, over: Partial<PersonalJobRecord> = {}) => view({ id, startsAt: day(daysAgo), endsAt: new Date(day(daysAgo).getTime() + 3_600_000), breakMinutes: 0, ...over });

describe("display helpers", () => {
  it("writes when a job happened in its own zone, with the end's date only when it is another day", () => {
    assert.equal(personalJobWhen(view()), "Mon, Dec 7, 2026 · 9:00 AM to 11:30 AM PST");
    assert.equal(personalJobWhen(view({ endsAt: new Date("2026-12-08T09:00:00Z") })), "Mon, Dec 7, 2026 · 9:00 AM to Tue, Dec 8, 1:00 AM PST");
    assert.equal(personalJobWhen(view({ timeZone: "America/New_York" })), "Mon, Dec 7, 2026 · 12:00 PM to 2:30 PM EST");
  });

  it("writes hours and minutes plainly", () => {
    assert.equal(hoursLabel(0), "0 min");
    assert.equal(hoursLabel(45), "45 min");
    assert.equal(hoursLabel(180), "3 h");
    assert.equal(hoursLabel(135), "2 h 15 min");
  });

  it("turns a saved job into the form's values (wall clock in its zone) and starts a new one today at 9", () => {
    assert.deepEqual(personalJobFormValues(view({ label: "Class", setting: "Education", miles: "12.5", roundTrip: true })), {
      label: "Class", setting: "Education", startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "11:30",
      timeZone: "America/Los_Angeles", breakMinutes: "30", miles: "12.5", roundTrip: true,
    });
    assert.equal(personalJobFormValues(view({ breakMinutes: 0 })).breakMinutes, "");
    assert.deepEqual(emptyPersonalJobForm("America/Denver", "2026-12-07"), {
      label: "", setting: "", startDate: "2026-12-07", startTime: "09:00", endDate: "2026-12-07", endTime: "10:00", timeZone: "America/Denver", breakMinutes: "", miles: "", roundTrip: false,
    });
  });
});

describe("the My work screen", () => {
  const board = async (jobs: PersonalJobView[]) => {
    const { PersonalJobsBoard } = await import("@/components/myWork/PersonalJobsBoard");
    return renderToStaticMarkup(React.createElement(PersonalJobsBoard, { initialJobs: jobs, defaultTimeZone: "America/Los_Angeles", generatedAt: new Date(NOW).toISOString() }));
  };

  it("with no jobs: says what it is for, offers Add, and has no export button", async () => {
    const html = await board([]);
    assert.ok(html.includes('data-my-work-empty="none"') && html.includes("No personal jobs yet"));
    assert.ok(html.includes("Add a personal job"));
    assert.ok(!html.includes("/api/my-work/export") && !html.includes("Export CSV"));
    assert.ok(html.includes("cannot be accepted"), "tells the interpreter an overlapping agency job cannot be accepted");
  });

  it("with jobs: totals for the three periods (hours and counted miles), the list for the chosen one, and the export link", async () => {
    const html = await board([
      at("a", 5, { miles: "10.0", roundTrip: true, countedMiles: "20.0", label: "Conference", setting: "Education" }),
      at("b", 45, { miles: "5.5", countedMiles: "5.5" }),
      at("c", 200),
    ]);
    assert.match(html, /data-range="30"[^>]*>[\s\S]*?Last 30 days[\s\S]*?1 h[\s\S]*?20\.0 mi counted · 1 job/);
    assert.match(html, /data-range="90"[^>]*>[\s\S]*?Last 90 days[\s\S]*?2 h[\s\S]*?25\.5 mi counted · 2 jobs/);
    assert.match(html, /data-range="all"[^>]*>[\s\S]*?All time[\s\S]*?3 h[\s\S]*?25\.5 mi counted · 3 jobs/);
    assert.ok(html.includes('aria-pressed="true" data-range="30"'), "opens on the last 30 days");
    assert.ok(html.includes('data-personal-job="a"') && !html.includes('data-personal-job="b"'), "only the 30 day job is listed");
    assert.ok(html.includes("Conference") && html.includes("Education") && html.includes("20.0 mi counted (10.0 each way)"));
    assert.ok(html.includes('href="/api/my-work/export"') && html.includes("Export CSV"));
  });

  it("a job without a label reads Personal job, and a long list shows twenty then offers more", async () => {
    const html = await board(Array.from({ length: 25 }, (_, i) => at(`job-${i}`, i + 1)));
    assert.equal((html.match(/data-personal-job="/g) ?? []).length, 20);
    assert.ok(html.includes("Show 5 more (5 left)"));
    assert.ok(html.includes(">Personal job<"));
  });

  it("uses the workspace theme's colours, not fixed grays for its accents, and has no em-dash", async () => {
    const html = await board([at("a", 5)]);
    for (const token of ["--forest", "--tint", "--tint-ink", "--surface", "--sage", "--ink"]) assert.ok(html.includes(`var(${token}`), token);
    assert.ok(!html.includes(EM_DASH) && !html.includes("indigo"));
  });
});

describe("the personal job form", () => {
  it("has the No client names hint on the optional label, the date and time fields, and the setting and zone choices", async () => {
    const { PersonalJobForm } = await import("@/components/myWork/PersonalJobForm");
    const html = renderToStaticMarkup(React.createElement(PersonalJobForm, { initial: emptyPersonalJobForm("America/Los_Angeles", "2026-12-07"), onSaved: () => undefined, onCancel: () => undefined }));
    assert.ok(html.includes("Label (optional)") && html.includes(`${LABEL_HINT}. Only you can see this.`));
    assert.match(html, /id="pj-label"[^>]*maxLength="80"|maxLength="80"[^>]*id="pj-label"/);
    for (const text of ["Start date", "Start time", "End date", "End time", "Time zone", "Setting (optional)", "Unpaid break", "Miles driven (optional)", "Round trip (counts double)", "Save personal job", "Cancel", "Add a personal job"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes("data-personal-job-form"));
  });

  it("says Edit and Save changes when editing", async () => {
    const { PersonalJobForm } = await import("@/components/myWork/PersonalJobForm");
    const html = renderToStaticMarkup(React.createElement(PersonalJobForm, { initial: personalJobFormValues(view({ label: "Class" })), editingId: "x", onSaved: () => undefined, onCancel: () => undefined }));
    assert.ok(html.includes("Edit personal job") && html.includes("Save changes") && !html.includes("Save personal job"));
    assert.ok(html.includes('value="Class"'));
  });
});

describe("the calendar's personal job blocks", () => {
  it("the page links Add a personal job to /my-work, beside Block time", () => {
    const page = read("src", "app", "(interpreter)", "interpreter-calendar", "page.tsx");
    const link = page.indexOf('href="/my-work"');
    assert.ok(link > 0 && page.indexOf("Add a personal job") > link);
    assert.ok(page.indexOf("Add a personal job") < page.indexOf(">\n              Block time"), "the link sits before the Block time button");
  });
});

describe("the files of My work", () => {
  it("are each under 300 lines, hold no any and no em-dash", () => {
    const files = [
      ["src", "app", "(interpreter)", "my-work", "page.tsx"], ["src", "app", "(interpreter)", "layout.tsx"], ["src", "app", "api", "my-work", "export", "route.ts"],
      ["src", "components", "myWork", "PersonalJobsBoard.tsx"], ["src", "components", "myWork", "PersonalJobForm.tsx"], ["src", "components", "myWork", "PersonalJobRow.tsx"], ["src", "components", "myWork", "MyWorkTotals.tsx"],
      ["src", "components", "interpreter", "interpreterNav.ts"], ["src", "lib", "personalJobs.ts"], ["src", "lib", "personalJobsStore.ts"], ["src", "lib", "myWorkData.ts"],
      ["src", "lib", "availability", "personalJobBlocks.ts"], ["src", "lib", "interpreterCalendar.ts"], ["src", "hooks", "useInterpreterCalendar.ts"],
      ["src", "app", "actions", "getInterpreterDayView.ts"], ["src", "app", "actions", "availabilityView.ts"], ["src", "lib", "agencyInterpreterView.ts"],
      ["src", "components", "calendar", "interpreter", "CalendarMonthView.tsx"], ["src", "components", "calendar", "interpreter", "CalendarWeekView.tsx"], ["src", "components", "calendar", "interpreter", "CalendarDayView.tsx"],
      ["src", "app", "(interpreter)", "interpreter-calendar", "page.tsx"], ["src", "components", "calendar", "TimelineBusyBlock.tsx"],
    ];
    for (const parts of files) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(source), `${name} has no any`);
      assert.ok(!source.includes(EM_DASH), `${name} has no em-dash`);
    }
  });

  it("the My work page and its export are plain server code that go through the interpreter check", () => {
    const route = read("src", "app", "api", "my-work", "export", "route.ts");
    assert.match(route, /requireInterpreter\(\)/);
    assert.match(route, /escapeFormulae: true/);
    assert.ok(!/label/i.test(route.match(/writeAuditLog\(\{[\s\S]*?\}\);/)?.[0] ?? ""));
    assert.match(read("src", "lib", "myWorkData.ts"), /requireInterpreter\(\)/);
    for (const parts of [["src", "lib", "myWorkData.ts"], ["src", "lib", "personalJobsStore.ts"], ["src", "lib", "availability", "personalJobBlocks.ts"]]) {
      assert.ok(!/^"use server";/m.test(read(...parts)), `${parts.join("/")} is not an endpoint`);
    }
  });
});
