import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;

const EM_DASH = String.fromCharCode(0x2014);
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the Calendar page's subscription card", () => {
  it("renders its title, what it does and the plain note about already-synced events", async () => {
    const { CalendarFeedCard } = await import("@/components/calendar/interpreter/CalendarFeedCard");
    const html = renderToStaticMarkup(React.createElement(CalendarFeedCard));
    for (const text of ["Subscribe in your calendar app", "confirmed agency jobs, personal jobs and busy time", "Pending offers are not included", "cannot take back what was already fetched", "Anyone with the link can see your times"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes('id="calendar-feed"') && html.includes("data-calendar-feed"));
    assert.ok(!html.includes(EM_DASH));
  });

  it("has every control the card promises: create, one-time copy, detail level, last synced, rotate and revoke", () => {
    const source = read("src", "components", "calendar", "interpreter", "CalendarFeedCard.tsx");
    for (const text of ["Create feed link", "Copy link", "shown only once", "Busy only", "With setting", "Last synced:", "Not synced yet", "Rotate link", "Revoke", "Yes, rotate", "Yes, revoke", "Keep it"]) assert.ok(source.includes(text), text);
  });

  it("the Calendar page has a Subscribe button next to Block time and the card above Manage availability", () => {
    const page = read("src", "app", "(interpreter)", "interpreter-calendar", "page.tsx");
    assert.ok(page.indexOf("Subscribe") > page.indexOf("Block time"));
    assert.ok(page.indexOf("<CalendarFeedCard />") > 0 && page.indexOf("<CalendarFeedCard />") < page.indexOf("Manage availability"));
  });
});

describe("the files of the calendar feed", () => {
  const files = [
    ["src", "db", "calendarFeedSchema.ts"], ["src", "lib", "calendarFeed", "token.ts"], ["src", "lib", "calendarFeed", "ics.ts"], ["src", "lib", "calendarFeed", "events.ts"], ["src", "lib", "calendarFeed", "bookedRule.ts"],
    ["src", "lib", "calendarFeed", "sources.ts"], ["src", "lib", "calendarFeed", "feed.ts"], ["src", "lib", "calendarFeed", "store.ts"], ["src", "app", "actions", "calendarFeed.ts"],
    ["src", "app", "api", "calendar", "feed", "[token]", "route.ts"], ["src", "hooks", "useCalendarFeed.ts"], ["src", "components", "calendar", "interpreter", "CalendarFeedCard.tsx"], ["src", "app", "(interpreter)", "interpreter-calendar", "page.tsx"],
  ];

  it("are each under 300 lines, hold no any and no em-dash", () => {
    for (const parts of files) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(source), `${name} has no any`);
      assert.ok(!source.includes(EM_DASH), `${name} has no em-dash`);
    }
  });

  it("the migration is one additive table with the hash-only column, the two levels and the rate-limit columns", () => {
    const sql = read("src", "db", "migrations", "manual", "0016_calendar_feed.sql");
    const code = sql.replace(/--.*$/gm, "");
    assert.equal((code.match(/CREATE TABLE/g) ?? []).length, 1);
    assert.ok(!/ALTER TABLE|DROP |DELETE FROM|UPDATE /i.test(code));
    for (const part of ["token_hash text NOT NULL UNIQUE", "'^[0-9a-f]{64}$'", "detail_level varchar(10) NOT NULL DEFAULT 'busy'", "IN ('busy', 'generic')", "last_fetched_at", "window_started_at", "window_count integer", "WHERE revoked_at IS NULL"]) assert.ok(code.includes(part), part);
    assert.ok(!/\btoken\b\s+(text|varchar)/i.test(code), "there is no column that could hold the secret itself");
  });

  it("the endpoint is public by design (outside the middleware's protected paths) and nothing but its own helpers reads the feed table", async () => {
    const { requiredRoleForPath } = await import("@/lib/auth/routes");
    assert.equal(requiredRoleForPath("/api/calendar/feed/abc.ics"), null);
    assert.match(read("src", "app", "actions", "calendarFeed.ts"), /^"use server";/);
    for (const parts of [["src", "lib", "calendarFeed", "store.ts"], ["src", "lib", "calendarFeed", "sources.ts"], ["src", "lib", "calendarFeed", "feed.ts"]]) assert.ok(!/^"use server";/m.test(read(...parts)), `${parts.join("/")} is not an endpoint`);
    const route = read("src", "app", "api", "calendar", "feed", "[token]", "route.ts");
    assert.ok(!/console\.log|writeAuditLog/.test(route), "a fetch is not logged or audited");
    assert.ok(!/request\.url|nextUrl|pathname/.test(route.replace(/^\s*\/?\*.*$/gm, "").replace(/^ \*.*$/gm, "")), "the route never reads or prints the address");
  });

  it("security.md documents the exception to the token expiry rule, with its controls", () => {
    const doc = read("security.md");
    assert.ok(doc.includes("Documented exception: the calendar subscription link"));
    for (const part of ["SHA-256", "revoke", "rotate", "identical `404`", "rate limited", "no PHI", "Referrer-Policy: no-referrer"]) assert.ok(doc.toLowerCase().includes(part.toLowerCase()), part);
  });
});
