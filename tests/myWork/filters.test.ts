import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FILTER_SETTINGS } from "@/lib/requestOptions";
import { ALL_SETTINGS } from "@/lib/websiteRequestView";
import {
  DEFAULT_JOB_FILTERS, applyPersonalJobFilters, exportQuery, hasActiveJobFilters, isUpcoming, matchesJobQuery, parseExportQuery, personalJobSettingOptions, personalJobTabCounts,
} from "@/lib/personalJobFilters";
import type { PersonalJobFilters } from "@/lib/personalJobFilters";
import { personalJobDateTile, toPersonalJobView } from "@/lib/personalJobs";
import type { PersonalJobRecord, PersonalJobView } from "@/lib/personalJobs";

(globalThis as { React?: typeof React }).React = React;

const EM_DASH = String.fromCharCode(0x2014);
const NOW = Date.parse("2026-12-07T12:00:00Z");
const HOUR = 3_600_000;
const record = (over: Partial<PersonalJobRecord>): PersonalJobRecord => ({
  id: "11111111-1111-4111-8111-111111111111", label: null, setting: null, startsAt: new Date(NOW), endsAt: new Date(NOW + HOUR), timeZone: "America/Los_Angeles", breakMinutes: 0, miles: null, roundTrip: false, countedMiles: null, ...over,
});
/** A job that starts `startHours` from NOW and lasts `lengthHours`. */
const job = (id: string, startHours: number, lengthHours: number, over: Partial<PersonalJobRecord> = {}): PersonalJobView =>
  toPersonalJobView(record({ id, startsAt: new Date(NOW + startHours * HOUR), endsAt: new Date(NOW + (startHours + lengthHours) * HOUR), ...over }));
const filters = (patch: Partial<PersonalJobFilters> = {}): PersonalJobFilters => ({ ...DEFAULT_JOB_FILTERS, ...patch });
const ids = (list: readonly PersonalJobView[]): string[] => list.map((j) => j.id);

const JOBS = [
  job("past-class", -48, 3, { label: "Spring class", setting: "Education", miles: "10.0", countedMiles: "10.0" }),
  job("past-clinic", -5, 1, { label: "Clinic visit", setting: "Medical", miles: "4.0", roundTrip: true, countedMiles: "8.0" }),
  job("now-meeting", -1, 2, { label: "Board meeting", setting: "Business" }),
  job("later-court", 24, 4, { label: "Hearing", setting: "Legal", miles: "30.0", countedMiles: "30.0" }),
];

describe("Upcoming and Completed", () => {
  it("a job is upcoming until it ends (one in progress is upcoming), and the tab counts add up", () => {
    assert.equal(isUpcoming(JOBS[0], NOW), false);
    assert.equal(isUpcoming(JOBS[2], NOW), true, "ends an hour from now");
    assert.equal(isUpcoming(job("edge", -1, 1), NOW), false, "ends exactly now: completed");
    assert.deepEqual(personalJobTabCounts(JOBS, NOW), { all: 4, upcoming: 2, completed: 2 });
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ tab: "upcoming" }), NOW)), ["later-court", "now-meeting"]);
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ tab: "completed" }), NOW)), ["past-clinic", "past-class"]);
  });
});

describe("search, setting and sort", () => {
  it("searches the label and the setting, any case, every word", () => {
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ query: "CLINIC" }), NOW)), ["past-clinic"]);
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ query: "medical visit" }), NOW)), ["past-clinic"], "one word from the setting, one from the label");
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ query: "legal clinic" }), NOW)), []);
    assert.equal(matchesJobQuery(JOBS[0], "   "), true, "blank search shows everything");
    assert.equal(matchesJobQuery(toPersonalJobView(record({ label: null, setting: null })), "personal"), false, "the 'Personal job' title is not searchable text");
  });

  it("narrows to one setting, matching case-insensitively, and the options are All settings plus the system list plus any other a job carries", () => {
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ setting: "medical" }), NOW)), ["past-clinic"]);
    const options = personalJobSettingOptions([...JOBS, job("odd", 0, 1, { setting: "Conference" })]);
    assert.equal(options[0], ALL_SETTINGS);
    assert.deepEqual(options.slice(1, 1 + FILTER_SETTINGS.length), [...FILTER_SETTINGS]);
    assert.equal(options[options.length - 1], "Conference");
    assert.equal(new Set(options).size, options.length, "no repeats");
  });

  it("sorts newest, oldest, most hours and most miles (jobs without miles last), ties by newest", () => {
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ sort: "newest" }), NOW)), ["later-court", "now-meeting", "past-clinic", "past-class"]);
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ sort: "oldest" }), NOW)), ["past-class", "past-clinic", "now-meeting", "later-court"]);
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ sort: "hours" }), NOW)), ["later-court", "past-class", "now-meeting", "past-clinic"]);
    assert.deepEqual(ids(applyPersonalJobFilters(JOBS, filters({ sort: "miles" }), NOW)), ["later-court", "past-class", "past-clinic", "now-meeting"]);
  });

  it("knows when a view is not the default (search, setting or sort), and the tab alone is not a filter", () => {
    assert.equal(hasActiveJobFilters(DEFAULT_JOB_FILTERS), false);
    assert.equal(hasActiveJobFilters(filters({ tab: "completed" })), false);
    for (const patch of [{ query: "x" }, { setting: "Medical" }, { sort: "hours" as const }]) assert.equal(hasActiveJobFilters(filters(patch)), true);
  });

  it("does not change the list it was given", () => {
    const copy = ids(JOBS);
    applyPersonalJobFilters(JOBS, filters({ sort: "oldest" }), NOW);
    assert.deepEqual(ids(JOBS), copy);
  });
});

describe("the CSV link and the export read the same view", () => {
  it("writes only what is set, and reads it back", () => {
    assert.equal(exportQuery("30", DEFAULT_JOB_FILTERS), "range=30");
    const query = exportQuery("90", filters({ tab: "completed", query: "  court  ", setting: "Legal" }));
    assert.equal(query, "range=90&tab=completed&q=court&setting=Legal");
    const parsed = parseExportQuery(new URLSearchParams(query));
    assert.deepEqual(parsed, { range: "90", filters: { tab: "completed", query: "court", setting: "Legal", sort: "newest" } });
  });

  it("reads nothing as everything, and ignores a value it does not know", () => {
    assert.deepEqual(parseExportQuery(new URLSearchParams("")), { range: "all", filters: { tab: "all", query: "", setting: ALL_SETTINGS, sort: "newest" } });
    assert.equal(parseExportQuery(new URLSearchParams("range=7&tab=bogus")).range, "all");
    assert.equal(parseExportQuery(new URLSearchParams("range=7&tab=bogus")).filters.tab, "all");
    assert.equal(parseExportQuery(new URLSearchParams(`q=${"x".repeat(500)}`)).filters.query.length, 100, "a long search is cut");
  });
});

describe("the toolbar and the card", () => {
  it("the toolbar has the search with its / hint, the three tabs with counts, the setting and sort choices, and Showing X of Y", async () => {
    const { MyWorkToolbar } = await import("@/components/myWork/MyWorkToolbar");
    const html = renderToStaticMarkup(React.createElement(MyWorkToolbar, { filters: filters(), counts: { all: 4, upcoming: 2, completed: 2 }, settings: personalJobSettingOptions(JOBS), shown: 4, onChange: () => undefined, onClear: () => undefined }));
    assert.ok(html.includes('placeholder="Search label or setting"') && html.includes('aria-label="Search personal jobs"') && html.includes(">/</kbd>"));
    for (const tab of ["all", "upcoming", "completed"]) assert.ok(html.includes(`data-tab="${tab}"`), tab);
    assert.match(html, /data-tab="upcoming"[^>]*>[\s\S]*?Upcoming[\s\S]*?>2</);
    assert.ok(html.includes('aria-label="Setting"') && html.includes('aria-label="Sort by"') && html.includes("Newest first") && html.includes("All settings"));
    assert.ok(html.includes("Showing 4 of 4") && !html.includes("Clear filters"), "no Clear filters while the view is the default");
    assert.ok(!html.includes(EM_DASH));
  });

  it("offers Clear filters once something narrows the list, and shows the tab's own total", async () => {
    const { MyWorkToolbar } = await import("@/components/myWork/MyWorkToolbar");
    const html = renderToStaticMarkup(React.createElement(MyWorkToolbar, { filters: filters({ tab: "upcoming", query: "court" }), counts: { all: 4, upcoming: 2, completed: 2 }, settings: [ALL_SETTINGS], shown: 1, onChange: () => undefined, onClear: () => undefined }));
    assert.ok(html.includes("Showing 1 of 2") && html.includes("Clear filters") && html.includes('value="court"'));
  });

  it("the card has the date block, the title, the when line, the pills and Edit / Delete, and Upcoming only when it is", async () => {
    const { PersonalJobRow } = await import("@/components/myWork/PersonalJobRow");
    const sample = toPersonalJobView(record({ label: "Spring class", setting: "Education", startsAt: new Date("2026-11-24T17:00:00Z"), endsAt: new Date("2026-11-24T19:30:00Z"), breakMinutes: 30, miles: "12.5", roundTrip: true, countedMiles: "25.0" }));
    const render = (upcoming: boolean) => renderToStaticMarkup(React.createElement(PersonalJobRow, { job: sample, upcoming, onEdit: () => undefined, onDelete: async () => null }));
    const html = render(true);
    assert.deepEqual(personalJobDateTile(sample), { month: "NOV", day: "24" });
    assert.match(html, /data-date-tile=""[^>]*>[\s\S]*?NOV[\s\S]*?24/);
    assert.ok(html.includes(">Spring class<") && html.includes("Tue, Nov 24, 2026 · 9:00 AM to 11:30 AM PST"));
    for (const text of ["Education", "2 h worked", "30 min break", "25.0 mi counted (12.5 each way)", ">Edit<", ">Delete<", "Upcoming"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes('data-upcoming="true"') && !render(false).includes("Upcoming") && render(false).includes('data-upcoming="false"'));
    assert.ok(html.includes("var(--banner-edge)") && !html.includes("border-gray-200"), "uses the workspace theme like a Website request card");
    assert.ok(!html.includes(EM_DASH));
  });

  it("the date block uses the job's own zone: a late evening Pacific job is still that Pacific day", () => {
    assert.deepEqual(personalJobDateTile({ startsAt: "2026-12-01T05:30:00Z", timeZone: "America/Los_Angeles" }), { month: "NOV", day: "30" });
    assert.deepEqual(personalJobDateTile({ startsAt: "2026-12-01T05:30:00Z", timeZone: "America/New_York" }), { month: "DEC", day: "1" });
  });

  it("the new files are each under 300 lines, hold no any and no em-dash", () => {
    for (const parts of [["src", "lib", "personalJobFilters.ts"], ["src", "components", "myWork", "MyWorkToolbar.tsx"], ["src", "components", "myWork", "MyWorkTotals.tsx"], ["src", "components", "myWork", "PersonalJobRow.tsx"], ["src", "components", "myWork", "PersonalJobsBoard.tsx"], ["src", "lib", "personalJobs.ts"], ["src", "app", "api", "my-work", "export", "route.ts"]]) {
      const source = readFileSync(join(process.cwd(), ...parts), "utf8");
      assert.ok(source.split("\n").length < 300, `${parts.join("/")} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(source), `${parts.join("/")} has no any`);
      assert.ok(!source.includes(EM_DASH), `${parts.join("/")} has no em-dash`);
    }
  });
});
