import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { db } from "@/db";
import { PUBLIC_INTAKE_CHANNEL, buildPublicRequest, parsePublicIntake } from "@/lib/publicIntake";
import { loadWebsiteRequests, toWebsiteRequestRow, websiteStatusLabel } from "@/lib/websiteRequests";

(globalThis as { React?: typeof React }).React = React;

const ID = "0ff171b4-0000-4000-8000-000000000001";
const raw = {
  id: ID,
  status: "draft",
  createdAt: new Date("2026-12-01T16:45:00Z"),
  receivedAt: "2026-11-20T22:15:00.000Z",
  setting: "Medical",
  format: "In person",
  timeZone: "Pacific Time — Seattle, Los Angeles",
};

describe("a website request's row", () => {
  it("shows the requested time in the request's own zone, when it was received, the setting and the status", () => {
    const row = toWebsiteRequestRow(raw);
    assert.equal(row.id, ID);
    assert.match(row.reference, /^APT-[A-Z0-9]{6}$/);
    assert.equal(row.statusLabel, "Needs review");
    assert.equal(row.requestedFor, "Tue, Dec 1, 2026 · 8:45 AM PST");
    assert.equal(row.receivedLabel, "Nov 20, 2:15 PM PST");
    assert.equal(row.setting, "Medical");
    assert.equal(row.format, "In person");
  });

  it("copes with anything missing", () => {
    const row = toWebsiteRequestRow({ ...raw, receivedAt: null, setting: null, format: null, timeZone: null, createdAt: new Date("not a date") });
    assert.equal(row.receivedLabel, null);
    assert.equal(row.setting, "Not stated");
    assert.equal(row.format, "Not stated");
    assert.equal(row.requestedFor, "Date to be confirmed");
  });

  it("names the statuses plainly and passes an unknown one through", () => {
    assert.equal(websiteStatusLabel("draft"), "Needs review");
    assert.equal(websiteStatusLabel("booked"), "Booked");
    assert.equal(websiteStatusLabel("Offer awaiting response"), "Offer awaiting response");
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
});

describe("the Website requests list", () => {
  it("shows each request with its date, setting, status and a link to open it", async () => {
    const { WebsiteRequestsList } = await import("@/components/requests/WebsiteRequestsList");
    const html = renderToStaticMarkup(React.createElement(WebsiteRequestsList, { rows: [toWebsiteRequestRow(raw)] }));
    assert.ok(html.includes('data-website-requests="list"'));
    assert.ok(html.includes("Tue, Dec 1, 2026"));
    assert.ok(html.includes("Medical") && html.includes("Needs review") && html.includes("Received Nov 20, 2:15 PM PST"));
    assert.ok(html.includes(`href="/requests/${ID}"`) && html.includes("Open request"));
    assert.ok(!html.includes("No website requests yet"));
  });

  it("keeps the empty state only when there are none, and shows a failure plainly", async () => {
    const { WebsiteRequestsList } = await import("@/components/requests/WebsiteRequestsList");
    const empty = renderToStaticMarkup(React.createElement(WebsiteRequestsList, { rows: [] }));
    assert.ok(empty.includes("No website requests yet") && empty.includes('data-website-requests="empty"'));
    const failed = renderToStaticMarkup(React.createElement(WebsiteRequestsList, { rows: [], loadFailed: true }));
    assert.ok(failed.includes('role="alert"') && !failed.includes("No website requests yet"));
  });
});
