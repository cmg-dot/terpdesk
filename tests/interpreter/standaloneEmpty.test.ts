import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatHomeJobDate, homeIanaZone, parseSafeDate } from "@/lib/interpreterHomeDates";

(globalThis as { React?: typeof React }).React = React;

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
const EM_DASH = String.fromCharCode(0x2014);
const hrefs = (html: string): string[] => Array.from(html.matchAll(/href="([^"]+)"/g), (m) => m[1]);

const TOUCHED = [
  ["src", "app", "(interpreter)", "interpreter-home", "page.tsx"],
  ["src", "app", "(interpreter)", "jobs", "page.tsx"],
  ["src", "components", "features", "MileageOverview.tsx"],
  ["src", "components", "features", "MileageEmpty.tsx"],
  ["src", "components", "interpreter", "StandaloneSteps.tsx"],
  ["src", "components", "interpreter", "jobs", "UpcomingEmpty.tsx"],
  ["src", "components", "interpreter", "home", "GettingStartedCard.tsx"],
  ["src", "components", "interpreter", "home", "HappeningNowBanner.tsx"],
  ["src", "components", "interpreter", "home", "HomeStatsCard.tsx"],
  ["src", "components", "interpreter", "home", "HoursToSubmitSection.tsx"],
  ["src", "components", "interpreter", "home", "UpcomingBookingCard.tsx"],
  ["src", "hooks", "useInterpreterHome.ts"],
  ["src", "hooks", "useConnectedAgencyCount.ts"],
  ["src", "lib", "interpreterHomeDates.ts"],
];

describe("the steps an interpreter without agency work is shown", () => {
  it("link to the calendar, the profile and Agencies, in that order", async () => {
    const { StandaloneSteps } = await import("@/components/interpreter/StandaloneSteps");
    const html = renderToStaticMarkup(React.createElement(StandaloneSteps, { connected: false }));
    assert.deepEqual(hrefs(html), ["/interpreter-calendar", "/profile", "/agencies"]);
    assert.ok(html.includes("Set your availability") && html.includes("Complete your profile and credentials") && html.includes("Connect with an agency"));
  });

  it("leave out Connect with an agency for someone already connected", async () => {
    const { StandaloneSteps } = await import("@/components/interpreter/StandaloneSteps");
    const html = renderToStaticMarkup(React.createElement(StandaloneSteps, { connected: true, compact: true }));
    assert.deepEqual(hrefs(html), ["/interpreter-calendar", "/profile"]);
  });

  it("only promise what the app does today: nothing about logging personal jobs as if it existed", async () => {
    const { STANDALONE_STEPS } = await import("@/components/interpreter/StandaloneSteps");
    const all = STANDALONE_STEPS.map((s) => `${s.title} ${s.text}`).join(" ");
    assert.ok(!/personal job|log your own|export/i.test(all));
    assert.ok(!all.includes(EM_DASH));
  });
});

describe("Home's Getting started card", () => {
  const card = async (count: number | null) => {
    const { GettingStartedCard } = await import("@/components/interpreter/home/GettingStartedCard");
    return renderToStaticMarkup(React.createElement(GettingStartedCard, { connectedAgencyCount: count }));
  };

  it("shows for an interpreter with no agency, with the three steps and a plain note about outside jobs", async () => {
    const html = await card(0);
    assert.ok(html.includes('data-getting-started=""') && html.includes("Getting started"));
    assert.deepEqual(hrefs(html), ["/interpreter-calendar", "/profile", "/agencies"]);
    assert.ok(html.includes("not available yet"), "says outside-agency tracking does not exist yet");
    assert.ok(!html.includes(EM_DASH));
  });

  it("is not there while the count loads, or once connected", async () => {
    assert.equal(await card(null), "");
    assert.equal(await card(1), "");
    assert.equal(await card(3), "");
  });
});

describe("the Mileage empty state", () => {
  it("explains where mileage comes from and what is not counted, with links", async () => {
    const { MileageEmpty } = await import("@/components/features/MileageEmpty");
    const html = renderToStaticMarkup(React.createElement(MileageEmpty, { noneAtAll: true, allTime: false }));
    assert.ok(html.includes('data-mileage-empty="none"') && html.includes("No mileage yet"));
    assert.ok(html.includes("outside an agency is not available yet"));
    assert.deepEqual(hrefs(html), ["/jobs", "/agencies"]);
    assert.ok(!html.includes(EM_DASH));
  });

  it("keeps the short note when there is mileage, just not in the chosen period", async () => {
    const { MileageEmpty } = await import("@/components/features/MileageEmpty");
    assert.ok(renderToStaticMarkup(React.createElement(MileageEmpty, { noneAtAll: false, allTime: false })).includes("in this period"));
    assert.ok(renderToStaticMarkup(React.createElement(MileageEmpty, { noneAtAll: false, allTime: true })).includes("yet"));
  });
});

describe("the Jobs empty state", () => {
  it("is used for an empty Upcoming tab and reads the connection count itself", () => {
    assert.match(read("src", "app", "(interpreter)", "jobs", "page.tsx"), /<UpcomingEmpty \/>/);
    const source = read("src", "components", "interpreter", "jobs", "UpcomingEmpty.tsx");
    assert.match(source, /useConnectedAgencyCount/);
    assert.match(source, /count === 0/);
  });
});

describe("the date text moved out of Home's page is unchanged", () => {
  it("formats a job in the profile's zone, and says Date TBD for nothing usable", () => {
    assert.equal(formatHomeJobDate("America/Los_Angeles", "2026-12-01T16:45:00Z", "2026-12-01T17:45:00Z"), "TUE, DEC 1 · 8:45 AM – 9:45 AM PST");
    assert.equal(formatHomeJobDate("Eastern Time - New York", "2026-12-01T16:45:00Z", undefined), "TUE, DEC 1 · 11:45 AM – 11:45 AM EST");
    assert.equal(formatHomeJobDate("America/Los_Angeles", undefined), "Date TBD");
    assert.equal(formatHomeJobDate("America/Los_Angeles", "not a date"), "Date TBD");
  });

  it("reads loose dates and maps zone names", () => {
    assert.equal(parseSafeDate("2026-12-01 08:00")?.getFullYear(), 2026);
    assert.equal(parseSafeDate("1790000000000")?.getTime(), 1790000000000);
    assert.equal(parseSafeDate("nope"), null);
    assert.equal(homeIanaZone("Mountain Time"), "America/Denver");
    assert.equal(homeIanaZone(undefined), "America/Los_Angeles");
  });
});

describe("the files this change touches", () => {
  it("are each under 300 lines, hold no any and no em-dash", () => {
    for (const parts of TOUCHED) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b/.test(source), `${name} has no any`);
      assert.ok(!source.includes(EM_DASH), `${name} has no em-dash`);
    }
  });

  it("leave Home's page a layout over the extracted parts", () => {
    const page = read("src", "app", "(interpreter)", "interpreter-home", "page.tsx");
    for (const part of ["HappeningNowBanner", "HomeStatsCard", "HoursToSubmitSection", "UpcomingBookingCard", "GettingStartedCard", "useInterpreterHome"]) {
      assert.ok(page.includes(part), part);
    }
  });
});
