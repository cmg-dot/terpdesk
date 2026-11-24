import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JOBS_PER_PAGE, pageWindow } from "@/lib/personalJobFilters";
import { personalJobFormValues, toPersonalJobView } from "@/lib/personalJobs";
import type { PersonalJobRecord, PersonalJobView } from "@/lib/personalJobs";

(globalThis as { React?: typeof React }).React = React;

const NOW = Date.parse("2026-12-07T12:00:00Z");
const record = (i: number, over: Partial<PersonalJobRecord> = {}): PersonalJobRecord => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, label: `Job ${i}`, setting: "Education",
  startsAt: new Date(NOW - (i + 1) * 86_400_000), endsAt: new Date(NOW - (i + 1) * 86_400_000 + 3_600_000),
  timeZone: "America/Los_Angeles", breakMinutes: 0, miles: null, roundTrip: false, countedMiles: null, ...over,
});
const jobs = (n: number): PersonalJobView[] => Array.from({ length: n }, (_, i) => toPersonalJobView(record(i)));
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("pageWindow", () => {
  it("holds ten jobs a page and says which ones", () => {
    assert.equal(JOBS_PER_PAGE, 10);
    assert.deepEqual(pageWindow(24, 1), { page: 1, pages: 3, from: 1, to: 10, start: 0, end: 10 });
    assert.deepEqual(pageWindow(24, 3), { page: 3, pages: 3, from: 21, to: 24, start: 20, end: 24 });
    assert.deepEqual(pageWindow(10, 1), { page: 1, pages: 1, from: 1, to: 10, start: 0, end: 10 });
    assert.deepEqual(pageWindow(0, 1), { page: 1, pages: 1, from: 0, to: 0, start: 0, end: 0 });
  });

  it("never lands past the last page or before the first (the last job on the last page was deleted)", () => {
    assert.equal(pageWindow(20, 3).page, 2);
    assert.equal(pageWindow(5, 9).page, 1);
    assert.equal(pageWindow(24, 0).page, 1);
    assert.equal(pageWindow(24, Number.NaN).page, 1);
  });
});

describe("the pager", () => {
  const render = async (total: number, page: number) => {
    const { MyWorkPager } = await import("@/components/myWork/MyWorkPager");
    return renderToStaticMarkup(React.createElement(MyWorkPager, { window: pageWindow(total, page), total, onPage: () => undefined }));
  };

  it("says Showing 1-10 of 24, with Previous off on the first page and Next off on the last", async () => {
    const first = await render(24, 1);
    assert.ok(first.includes("Showing 1-10 of 24") && first.includes("Page 1 of 3") && first.includes('aria-label="Pagination"'));
    assert.match(first, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    assert.doesNotMatch(first, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
    const last = await render(24, 3);
    assert.ok(last.includes("Showing 21-24 of 24") && last.includes("Page 3 of 3"));
    assert.match(last, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
    assert.doesNotMatch(last, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  });

  it("is not drawn when everything fits on one page", async () => {
    assert.equal(await render(10, 1), "");
    assert.equal(await render(0, 1), "");
  });
});

describe("the card's inline edit", () => {
  const sample = jobs(1)[0] as PersonalJobView;
  const row = async (editing: boolean) => {
    const { PersonalJobRow } = await import("@/components/myWork/PersonalJobRow");
    return renderToStaticMarkup(React.createElement(PersonalJobRow, { job: sample, editing, onEdit: () => undefined, onSaved: () => undefined, onCancelEdit: () => undefined, onDelete: async () => null }));
  };

  it("shows no form until Edit is pressed, and Edit and Delete while it is closed", async () => {
    const html = await row(false);
    assert.ok(!html.includes("data-personal-job-form") && html.includes(">Edit<") && html.includes(">Delete<") && html.includes('data-editing="false"'));
  });

  it("opens the form inside the card, filled in, with Save changes and Cancel, ids of its own, and no Edit or Delete", async () => {
    const html = await row(true);
    assert.ok(html.includes('data-editing="true"') && html.includes("data-personal-job-form") && html.includes("Edit personal job"));
    assert.ok(html.includes("Save changes") && html.includes(">Cancel<") && html.includes(`id="pj-edit-${sample.id}-label"`));
    assert.ok(!html.includes('id="pj-label"'), "its ids never clash with the Add panel's");
    assert.ok(html.includes(`value="${personalJobFormValues(sample).label}"`));
    assert.ok(!html.includes(">Edit<") && !html.includes(">Delete<"));
    assert.ok(html.indexOf("data-personal-job-form") > html.indexOf("<h3"), "the form sits under the summary, in the same card");
  });
});

describe("motion and mobile", () => {
  it("every animation goes through the reduced motion setting", () => {
    for (const name of ["Reveal", "MyWorkList"]) assert.match(read("src", "components", "myWork", `${name}.tsx`), /useHoursMotion\(\)/, name);
    assert.match(read("src", "hooks", "useHoursMotion.ts"), /useReducedMotion/);
    assert.match(read("src", "components", "myWork", "PersonalJobsBoard.tsx"), /reduce \? "auto" : "smooth"/, "page changes scroll without animation too");
  });

  it("the three tiles stack on a phone, the tabs may wrap, and the controls are at least 44px tall there", () => {
    assert.match(read("src", "components", "myWork", "MyWorkTotals.tsx"), /grid-cols-1[^"]*sm:grid-cols-3/);
    const toolbar = read("src", "components", "myWork", "MyWorkToolbar.tsx");
    assert.match(toolbar, /flex flex-wrap gap-1/);
    assert.match(toolbar, /min-h-11[^"]*sm:min-h-9/);
    assert.match(read("src", "components", "myWork", "PersonalJobRow.tsx"), /min-h-11[^"]*sm:min-h-9/);
    assert.match(read("src", "components", "myWork", "MyWorkPager.tsx"), /min-h-11/);
  });
});
