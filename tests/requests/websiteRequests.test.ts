import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { db } from "@/db";
import { PUBLIC_INTAKE_CHANNEL, buildPublicRequest, parsePublicIntake } from "@/lib/publicIntake";
import { countWebsiteRequestsNeedingReview, loadWebsiteRequests, toWebsiteRequestRow, websiteFormatLabel, websiteStatusLabel } from "@/lib/websiteRequests";
import { DEFAULT_FILTERS } from "@/lib/websiteRequestView";

(globalThis as { React?: typeof React }).React = React;

const ID = "0ff171b4-0000-4000-8000-000000000001";
const raw = {
  id: ID,
  status: "draft",
  createdAt: new Date("2026-12-01T16:45:00Z"),
  endsAt: "2026-12-01T17:45:00.000Z",
  receivedAt: "2026-11-20T22:15:00.000Z",
  setting: "Medical",
  format: "In person",
  timeZone: "Pacific Time — Seattle, Los Angeles",
  org: "Harbor Clinic",
  requesterName: "Sample Requester",
  prefContact: "Email",
  teamSuggested: "Team of two",
  repeats: "true",
  recurrenceNote: "Every Tuesday for six weeks",
  location: "Harbor Clinic",
  venue: "Harbor Clinic",
  address: "100 Example Street",
};

describe("a website request's row", () => {
  it("shows the requested time in the request's own zone, when it was received, the setting and the status", () => {
    const row = toWebsiteRequestRow(raw);
    assert.equal(row.id, ID);
    assert.match(row.reference, /^APT-[A-Z0-9]{6}$/);
    assert.equal(row.statusLabel, "Needs review");
    assert.equal(row.needsReview, true);
    assert.equal(row.requestedFor, "Tue, Dec 1, 2026 · 8:45 AM PST");
    assert.equal(row.timeRange, "8:45 AM to 9:45 AM PST");
    assert.deepEqual(row.dateTile, { month: "Dec", day: "1", weekday: "Tue" });
    assert.equal(row.startsAt, "2026-12-01T16:45:00.000Z");
    assert.equal(row.receivedAt, "2026-11-20T22:15:00.000Z");
    assert.equal(row.receivedLabel, "Nov 20, 2:15 PM PST");
    assert.equal(row.setting, "Medical");
    assert.equal(row.format, "In person");
  });

  it("carries the organization, the requester, the place, the repeat pattern, the suggested team and the contact METHOD", () => {
    const row = toWebsiteRequestRow(raw);
    assert.equal(row.organization, "Harbor Clinic");
    assert.equal(row.requesterName, "Sample Requester");
    assert.equal(row.location, "Harbor Clinic");
    assert.equal(row.address, "100 Example Street");
    assert.equal(row.repeats, true);
    assert.equal(row.recurrenceNote, "Every Tuesday for six weeks");
    assert.equal(row.teamSuggested, "Team of two");
    assert.equal(row.preferredContact, "Email");
  });

  it("never carries an email address, a phone number or the free-text notes", () => {
    const row = toWebsiteRequestRow({ ...raw, email: "someone@example.org", phone: "555-0100", purpose: "A private reason" } as typeof raw);
    assert.deepEqual(Object.keys(row).filter((key) => /email|phone|purpose|notes|qualif|comm|people/i.test(key)), []);
    assert.ok(!JSON.stringify(row).includes("someone@example.org") && !JSON.stringify(row).includes("555-0100") && !JSON.stringify(row).includes("private reason"));
  });

  it("names the organization, else the requester, else says it was not provided", () => {
    assert.equal(toWebsiteRequestRow({ ...raw, org: "  " }).organization, "Sample Requester");
    assert.equal(toWebsiteRequestRow({ ...raw, org: null, requesterName: null }).organization, "Organization not provided");
  });

  it("copes with anything missing", () => {
    const row = toWebsiteRequestRow({ id: ID, status: "draft", createdAt: new Date("not a date"), receivedAt: null, setting: null, format: null, timeZone: null });
    assert.equal(row.receivedLabel, null);
    assert.equal(row.receivedAt, null);
    assert.equal(row.startsAt, null);
    assert.equal(row.dateTile, null);
    assert.equal(row.timeRange, null);
    assert.equal(row.setting, "Not stated");
    assert.equal(row.format, "Not stated");
    assert.equal(row.location, "Location to be confirmed");
    assert.equal(row.requestedFor, "Date to be confirmed");
    assert.equal(row.repeats, false);
    assert.equal(row.recurrenceNote, null);
  });

  it("shows a one-line format, a virtual request's place as Virtual, and an address only when it adds something", () => {
    assert.equal(websiteFormatLabel("Hybrid — in person and virtual"), "Hybrid");
    assert.equal(websiteFormatLabel("Virtual"), "Virtual");
    assert.equal(toWebsiteRequestRow({ ...raw, format: "Virtual", location: null, venue: null, address: null }).location, "Virtual");
    assert.equal(toWebsiteRequestRow({ ...raw, address: "Harbor Clinic" }).address, null);
  });

  it("keeps the repeat note only for a request that repeats, and dates both ends when it runs past midnight", () => {
    assert.equal(toWebsiteRequestRow({ ...raw, repeats: "false" }).recurrenceNote, null);
    assert.equal(toWebsiteRequestRow({ ...raw, endsAt: "2026-12-02T17:45:00.000Z" }).timeRange, "Tue, Dec 1, 8:45 AM to Wed, Dec 2, 9:45 AM PST");
    assert.equal(toWebsiteRequestRow({ ...raw, endsAt: "2026-12-01T16:00:00.000Z" }).timeRange, null);
  });

  it("names the statuses plainly and passes an unknown one through", () => {
    assert.equal(websiteStatusLabel("draft"), "Needs review");
    assert.equal(websiteStatusLabel("booked"), "Booked");
    assert.equal(websiteStatusLabel("cancelled"), "Cancelled");
    assert.equal(websiteStatusLabel("Offer awaiting response"), "Offer awaiting response");
    assert.equal(toWebsiteRequestRow({ ...raw, status: "booked" }).needsReview, false);
  });
});

describe("the loader", () => {
  it("lists exactly the requests the public form saves: its tag is the one a built request carries", () => {
    const parsed = parsePublicIntake(
      {
        requesterName: "Sample Requester",
        email: "requester@example.org",
        venue: "Sample Clinic",
        setting: "Medical",
        purpose: "Check-up",
        timeZone: "Pacific Time — Seattle, Los Angeles",
        startDate: "2027-03-02",
        startTime: "09:00",
        endTime: "10:00",
        format: "In person",
      },
      new Date("2026-11-22T00:00:00Z"),
    );
    assert.ok(parsed.ok);
    const built = buildPublicRequest(parsed.data);
    assert.equal((built.data as unknown as { source: { channel: string } }).source.channel, PUBLIC_INTAKE_CHANNEL);
    assert.equal(PUBLIC_INTAKE_CHANNEL, "public_intake_form");
  });

  it("reads rows from the executor, maps each one and applies the limit", async () => {
    let limitedTo = 0;
    const exec = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async (n: number) => ((limitedTo = n), [raw, { ...raw, id: "11111111-0000-4000-8000-000000000002", status: "booked" }]) }) }) }) }),
    } as unknown as Pick<typeof db, "select">;
    const rows = await loadWebsiteRequests(exec, 50);
    assert.equal(limitedTo, 50);
    assert.deepEqual(rows.map((r) => r.statusLabel), ["Needs review", "Booked"]);
  });

  it("asks the database for the board's own fields only: no email, phone, purpose, notes or qualifications", async () => {
    let fields: Record<string, unknown> = {};
    const exec = {
      select: (selected: Record<string, unknown>) => ((fields = selected), { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
    } as unknown as Pick<typeof db, "select">;
    await loadWebsiteRequests(exec);
    const asked = Object.keys(fields);
    assert.ok(asked.includes("org") && asked.includes("requesterName") && asked.includes("prefContact") && asked.includes("endsAt"));
    assert.deepEqual(asked.filter((key) => /email|phone|purpose|note$|qualif|comm|people|bill/i.test(key) && key !== "recurrenceNote"), []);
  });

  it("counts the requests still waiting for review, and says 0 when the count comes back empty", async () => {
    const counting = (rows: { value: number }[]) => ({ select: () => ({ from: () => ({ where: async () => rows }) }) }) as unknown as Pick<typeof db, "select">;
    assert.equal(await countWebsiteRequestsNeedingReview(counting([{ value: 7 }])), 7);
    assert.equal(await countWebsiteRequestsNeedingReview(counting([])), 0);
  });
});

describe("the Website requests board", () => {
  const NOW = Date.parse("2026-11-23T12:00:00Z");
  const board = async (rows: ReturnType<typeof toWebsiteRequestRow>[], over: { loadFailed?: boolean } = {}) => {
    const { WebsiteRequestsBoard } = await import("@/components/requests/website/WebsiteRequestsBoard");
    return renderToStaticMarkup(React.createElement(WebsiteRequestsBoard, { rows, initialFilters: DEFAULT_FILTERS, serverNow: NOW, ...over }));
  };

  it("shows each request with its date tile, organization, setting, status, waiting time and a way to open it", async () => {
    const html = await board([toWebsiteRequestRow(raw)]);
    assert.ok(html.includes('data-website-requests="list"') && html.includes(`data-website-request="${ID}"`));
    assert.ok(html.includes("Harbor Clinic") && html.includes("Medical") && html.includes("Needs review"));
    assert.ok(html.includes("Waiting 2d") && html.includes("Starts in 8 days"), "waiting and start labels");
    assert.ok(html.includes(`href="/requests/${ID}"`) && html.includes(">Review<"));
    assert.ok(html.includes("data-date-tile") && html.includes(">Dec<"));
    assert.ok(!html.includes("No website requests yet"));
  });

  it("opens on Needs review, with the tabs, the stats and the search box", async () => {
    const html = await board([toWebsiteRequestRow(raw), toWebsiteRequestRow({ ...raw, id: "22222222-0000-4000-8000-000000000002", status: "booked" })]);
    assert.ok(html.includes('aria-pressed="true" data-tab="needs_review"') && html.includes('aria-pressed="false" data-tab="handled"'));
    for (const text of ["Needs review", "Handled", "Starting within 48 hours", "Longest waiting", "Search website requests"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes("Showing 1 of 1"), "the booked one is behind the Handled tab");
    assert.ok(!html.includes("22222222"), "a handled request is not in the Needs review list");
  });

  it("keeps the preview closed until a card is opened, and holds no contact details", async () => {
    const html = await board([toWebsiteRequestRow(raw)]);
    assert.ok(html.includes('data-expandable="website-request"') && html.includes('data-open="false"'));
    assert.ok(!html.includes("data-website-preview"), "the preview is not in the page until opened");
    assert.ok(!/\S+@\S+\.\S+/.test(html), "no email address anywhere in the page");
  });

  it("uses the workspace theme's colours, not fixed grays, and has no em-dash", async () => {
    const html = await board([toWebsiteRequestRow(raw)]);
    for (const token of ["--forest", "--tint", "--tint-ink", "--surface", "--pill", "--canvas", "--badge"]) assert.ok(html.includes(`var(${token}`), token);
    assert.ok(!html.includes("border-gray-200") && !html.includes("indigo"));
    assert.ok(!html.includes(String.fromCharCode(0x2014)));
  });

  it("shows the empty state only when there are none, and a failure plainly", async () => {
    const empty = await board([]);
    assert.ok(empty.includes("No website requests yet") && empty.includes('data-website-requests="empty"'));
    const failed = await board([], { loadFailed: true });
    assert.ok(failed.includes('role="alert"') && !failed.includes("No website requests yet"));
  });

  it("says the queue is clear when nothing needs review", async () => {
    const html = await board([toWebsiteRequestRow({ ...raw, status: "booked" })]);
    assert.ok(html.includes("You are all caught up") && html.includes("See handled requests"));
  });
});
