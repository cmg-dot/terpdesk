import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_FORMATS,
  ALL_SETTINGS,
  DEFAULT_FILTERS,
  applyFilters,
  boardStats,
  filterOptions,
  filtersToQuery,
  hasActiveFilters,
  matchesQuery,
  parseFilters,
  startsInLabel,
  tabCounts,
  urgencyOf,
  waitingLabel,
  waitingMinutes,
} from "@/lib/websiteRequestView";
import { REQUEST_FORMATS, REQUEST_SETTINGS } from "@/lib/requestOptions";
import { toWebsiteRequestRow } from "@/lib/websiteRequests";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

let n = 0;
/** A row that starts `startsIn` ms from NOW and was received `waited` ms before NOW. */
const row = (over: { startsIn?: number | null; waited?: number | null; status?: string; org?: string; setting?: string; format?: string; id?: string; requesterName?: string } = {}): WebsiteRequestRow => {
  n += 1;
  const start = over.startsIn === null ? "not a date" : new Date(NOW + (over.startsIn ?? 10 * DAY)).toISOString();
  return toWebsiteRequestRow({
    // The APT reference is the id's first six characters, so the counter goes there to keep every reference different.
    id: over.id ?? `${n.toString(16).padStart(6, "0")}00-0000-4000-8000-000000000000`,
    status: over.status ?? "draft",
    createdAt: new Date(start),
    endsAt: over.startsIn === null ? null : new Date(Date.parse(start) + HOUR).toISOString(),
    receivedAt: over.waited === null ? null : new Date(NOW - (over.waited ?? HOUR)).toISOString(),
    setting: over.setting ?? "Medical",
    format: over.format ?? "In person",
    timeZone: "America/Los_Angeles",
    org: over.org ?? "Harbor Clinic",
    requesterName: over.requesterName ?? null,
  });
};

describe("urgency", () => {
  it("is urgent within 48 hours (48h exactly included), soon within 7 days, and none beyond", () => {
    assert.equal(urgencyOf(row({ startsIn: 2 * HOUR }), NOW), "urgent");
    assert.equal(urgencyOf(row({ startsIn: 48 * HOUR }), NOW), "urgent");
    assert.equal(urgencyOf(row({ startsIn: 48 * HOUR + 1000 }), NOW), "soon");
    assert.equal(urgencyOf(row({ startsIn: 7 * DAY }), NOW), "soon");
    assert.equal(urgencyOf(row({ startsIn: 7 * DAY + 1000 }), NOW), "none");
  });

  it("says passed for an unreviewed request that has already started, and none for a handled one or one with no time", () => {
    assert.equal(urgencyOf(row({ startsIn: -HOUR }), NOW), "passed");
    assert.equal(urgencyOf(row({ startsIn: 0 }), NOW), "passed");
    assert.equal(urgencyOf(row({ startsIn: 2 * HOUR, status: "booked" }), NOW), "none");
    assert.equal(urgencyOf(row({ startsIn: null }), NOW), "none");
  });
});

describe("waiting and starts-in labels", () => {
  it("counts whole minutes since it was submitted, never below zero, and only for unreviewed requests", () => {
    assert.equal(waitingMinutes(row({ waited: 90 * MIN + 30_000 }), NOW), 90);
    assert.equal(waitingMinutes(row({ waited: -5 * MIN }), NOW), 0, "a clock a little behind is not negative");
    assert.equal(waitingMinutes(row({ waited: HOUR, status: "booked" }), NOW), null);
    assert.equal(waitingMinutes(row({ waited: null }), NOW), null);
  });

  it("reads Just received, minutes, hours and days", () => {
    assert.equal(waitingLabel(0), "Just received");
    assert.equal(waitingLabel(1), "Waiting 1m");
    assert.equal(waitingLabel(59), "Waiting 59m");
    assert.equal(waitingLabel(60), "Waiting 1h");
    assert.equal(waitingLabel(23 * 60 + 59), "Waiting 23h");
    assert.equal(waitingLabel(24 * 60), "Waiting 1d");
    assert.equal(waitingLabel(5 * 24 * 60 + 600), "Waiting 5d");
  });

  it("says when it starts, in the largest whole unit", () => {
    assert.equal(startsInLabel(row({ startsIn: 45 * MIN }), NOW), "Starts in 45 min");
    assert.equal(startsInLabel(row({ startsIn: 20_000 }), NOW), "Starts in 1 min");
    assert.equal(startsInLabel(row({ startsIn: HOUR }), NOW), "Starts in 1 hour");
    assert.equal(startsInLabel(row({ startsIn: 5 * HOUR + 59 * MIN }), NOW), "Starts in 5 hours");
    assert.equal(startsInLabel(row({ startsIn: DAY }), NOW), "Starts in 1 day");
    assert.equal(startsInLabel(row({ startsIn: 3 * DAY + 5 * HOUR }), NOW), "Starts in 3 days");
    assert.equal(startsInLabel(row({ startsIn: -MIN }), NOW), "Start time has passed");
    assert.equal(startsInLabel(row({ startsIn: DAY, status: "booked" }), NOW), null);
    assert.equal(startsInLabel(row({ startsIn: null }), NOW), null);
  });
});

describe("search", () => {
  const clinic = row({ org: "Harbor Clinic", setting: "Medical", requesterName: "Pat Example" });

  it("finds an organization, setting, requester or APT reference, in any case, and ignores extra spaces", () => {
    assert.ok(matchesQuery(clinic, "harbor"));
    assert.ok(matchesQuery(clinic, "  MEDICAL "));
    assert.ok(matchesQuery(clinic, "pat ex"));
    assert.ok(matchesQuery(clinic, clinic.reference));
    assert.ok(matchesQuery(clinic, clinic.reference.toLowerCase().replace("apt-", "")));
  });

  it("needs every word to be found, and an empty search matches everything", () => {
    assert.ok(matchesQuery(clinic, "harbor medical"));
    assert.ok(!matchesQuery(clinic, "harbor legal"));
    assert.ok(!matchesQuery(clinic, "zzz"));
    assert.ok(matchesQuery(clinic, "   "));
  });
});

describe("tabs, filters and counts", () => {
  const rows = [
    row({ org: "A", status: "draft", setting: "Medical", format: "In person" }),
    row({ org: "B", status: "draft", setting: "Legal", format: "Virtual" }),
    row({ org: "C", status: "booked", setting: "Medical", format: "Virtual" }),
    row({ org: "D", status: "completed", setting: "Education", format: "Hybrid" }),
  ];
  const orgs = (list: WebsiteRequestRow[]) => list.map((r) => r.organization).sort();

  it("splits Needs review from Handled, and All has both", () => {
    assert.deepEqual(orgs(applyFilters(rows, DEFAULT_FILTERS, NOW)), ["A", "B"]);
    assert.deepEqual(orgs(applyFilters(rows, { ...DEFAULT_FILTERS, tab: "handled" }, NOW)), ["C", "D"]);
    assert.deepEqual(orgs(applyFilters(rows, { ...DEFAULT_FILTERS, tab: "all" }, NOW)), ["A", "B", "C", "D"]);
    assert.deepEqual(tabCounts(rows), { needs_review: 2, handled: 2, all: 4 });
  });

  it("narrows by setting and by format, and by both with a search", () => {
    const all = { ...DEFAULT_FILTERS, tab: "all" as const };
    assert.deepEqual(orgs(applyFilters(rows, { ...all, setting: "Medical" }, NOW)), ["A", "C"]);
    assert.deepEqual(orgs(applyFilters(rows, { ...all, format: "Virtual" }, NOW)), ["B", "C"]);
    assert.deepEqual(orgs(applyFilters(rows, { ...all, setting: "Medical", format: "Virtual" }, NOW)), ["C"]);
    assert.deepEqual(orgs(applyFilters(rows, { ...all, setting: "Medical", query: rows[0].reference }, NOW)), ["A"]);
    assert.deepEqual(applyFilters(rows, { ...all, setting: ALL_SETTINGS, format: ALL_FORMATS, query: "nothing like this" }, NOW), []);
  });

  it("always lists every setting and format our forms offer, in the forms' order, behind All", () => {
    const everySetting = [ALL_SETTINGS, ...REQUEST_SETTINGS];
    const everyFormat = [ALL_FORMATS, ...REQUEST_FORMATS];
    assert.deepEqual(filterOptions(rows), { settings: everySetting, formats: everyFormat });
    assert.deepEqual(filterOptions([]), { settings: everySetting, formats: everyFormat }, "an empty queue still has the full lists");
    const small = [row({ setting: "Education", format: "In person" })];
    assert.deepEqual(filterOptions(small), { settings: everySetting, formats: everyFormat }, "one request does not shrink the lists to its own values");
    assert.ok(["Education", "Medical", "Mental Health", "Workplace", "Legal", "Community", "Other"].every((s) => everySetting.includes(s)));
    assert.ok(["In person", "Virtual"].every((f) => everyFormat.includes(f)));
  });

  it("adds a value that is in the rows but not on the forms (sorted, after the form's choices), and never twice", () => {
    const odd = [row({ setting: "Not stated" }), row({ setting: "Zoo visit" }), row({ setting: "Employment" }), row({ setting: "medical" }), row({ setting: "Zoo visit" }), row({ format: "Phone" })];
    const { settings, formats } = filterOptions(odd);
    assert.deepEqual(settings.slice(0, 1 + REQUEST_SETTINGS.length), [ALL_SETTINGS, ...REQUEST_SETTINGS]);
    assert.deepEqual(settings.slice(1 + REQUEST_SETTINGS.length), ["Employment", "Not stated", "Zoo visit"]);
    assert.equal(settings.filter((s) => s.toLowerCase() === "medical").length, 1, "a different capitalisation is the same choice");
    assert.deepEqual(formats.slice(1 + REQUEST_FORMATS.length), ["Phone"]);
  });

  it("a choice with no requests gives an empty list, and a setting matches whatever its capitals", () => {
    const all = { ...DEFAULT_FILTERS, tab: "all" as const };
    assert.deepEqual(applyFilters(rows, { ...all, setting: "Mental Health" }, NOW), []);
    assert.deepEqual(orgs(applyFilters([row({ org: "Lower", setting: "medical" })], { ...all, setting: "Medical" }, NOW)), ["Lower"]);
  });

  it("does not change the rows it is given", () => {
    const before = rows.map((r) => r.id);
    applyFilters(rows, { ...DEFAULT_FILTERS, tab: "all", sort: "received" }, NOW);
    assert.deepEqual(rows.map((r) => r.id), before);
  });
});

describe("sorting", () => {
  const ids = (list: WebsiteRequestRow[]) => list.map((r) => r.organization);

  it("soonest appointment: upcoming first (nearest at the top), then the ones that already started (latest first), then no time", () => {
    const rows = [
      row({ org: "none", startsIn: null }),
      row({ org: "past-old", startsIn: -3 * DAY }),
      row({ org: "later", startsIn: 9 * DAY }),
      row({ org: "past-new", startsIn: -HOUR }),
      row({ org: "soon", startsIn: 2 * HOUR }),
    ];
    assert.deepEqual(ids(applyFilters(rows, DEFAULT_FILTERS, NOW)), ["soon", "later", "past-new", "past-old", "none"]);
  });

  it("newest received: latest submission first, those with no recorded time last", () => {
    const rows = [row({ org: "old", waited: 5 * DAY }), row({ org: "none", waited: null }), row({ org: "new", waited: MIN }), row({ org: "mid", waited: DAY })];
    assert.deepEqual(ids(applyFilters(rows, { ...DEFAULT_FILTERS, sort: "received" }, NOW)), ["new", "mid", "old", "none"]);
  });

  it("longest waiting: the oldest unreviewed first, handled requests after them", () => {
    const rows = [row({ org: "fresh", waited: MIN }), row({ org: "handled", waited: 9 * DAY, status: "booked" }), row({ org: "oldest", waited: 4 * DAY }), row({ org: "mid", waited: DAY })];
    assert.deepEqual(ids(applyFilters(rows, { ...DEFAULT_FILTERS, tab: "all", sort: "waiting" }, NOW)), ["oldest", "mid", "fresh", "handled"]);
  });

  it("is stable: equal rows keep a fixed order (by id), so the list never shuffles on a re-render", () => {
    const rows = [row({ org: "b", id: "bbbbbbbb-0000-4000-8000-000000000002", startsIn: DAY }), row({ org: "a", id: "aaaaaaaa-0000-4000-8000-000000000001", startsIn: DAY })];
    assert.deepEqual(ids(applyFilters(rows, DEFAULT_FILTERS, NOW)), ["a", "b"]);
    assert.deepEqual(ids(applyFilters([...rows].reverse(), DEFAULT_FILTERS, NOW)), ["a", "b"]);
  });
});

describe("the stats", () => {
  it("counts the queue, the ones starting within 48 hours and the longest wait", () => {
    const rows = [
      row({ startsIn: 5 * HOUR, waited: 2 * HOUR }),
      row({ startsIn: 30 * HOUR, waited: 3 * DAY }),
      row({ startsIn: 20 * DAY, waited: DAY }),
      row({ startsIn: 3 * HOUR, waited: 9 * DAY, status: "booked" }),
    ];
    assert.deepEqual(boardStats(rows, NOW), { needsReview: 3, startingSoon: 2, longestWaitingMinutes: 3 * 24 * 60 });
  });

  it("has no longest wait when nothing is waiting", () => {
    assert.deepEqual(boardStats([], NOW), { needsReview: 0, startingSoon: 0, longestWaitingMinutes: null });
    assert.equal(boardStats([row({ status: "booked" })], NOW).longestWaitingMinutes, null);
  });
});

describe("filters in the page address", () => {
  it("opens on Needs review, soonest appointment, with nothing searched", () => {
    assert.deepEqual(DEFAULT_FILTERS, { tab: "needs_review", query: "", setting: ALL_SETTINGS, format: ALL_FORMATS, sort: "soonest" });
    assert.deepEqual(parseFilters({}), DEFAULT_FILTERS);
    assert.equal(filtersToQuery(DEFAULT_FILTERS), "");
  });

  it("round-trips every choice", () => {
    const filters = { tab: "handled" as const, query: "harbor clinic", setting: "Medical", format: "Virtual", sort: "waiting" as const };
    const query = filtersToQuery(filters);
    assert.deepEqual(parseFilters(Object.fromEntries(new URLSearchParams(query))), filters);
  });

  it("ignores an unknown tab or sort, takes the first of a repeated parameter and caps a long search", () => {
    assert.equal(parseFilters({ tab: "everything" }).tab, "needs_review");
    assert.equal(parseFilters({ sort: "random" }).sort, "soonest");
    assert.equal(parseFilters({ tab: ["all", "handled"] }).tab, "all");
    assert.equal(parseFilters({ q: "x".repeat(500) }).query.length, 100);
  });

  it("knows when a search or filter is on (the tab alone does not count)", () => {
    assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, tab: "all" }), false);
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, query: "a" }), true);
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "received" }), true);
    assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, setting: "Legal" }), true);
  });
});
