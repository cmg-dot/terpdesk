import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeJob } from "@/lib/jobSummary";
import { renderOfferConfirmPage } from "@/lib/offerConfirmPage";
import { offerPlaceOf } from "@/lib/offerPlace";
import { receiptDateLabel, renderHtmlCard, scheduleLine } from "@/lib/offerReceiptCard";
import { SHELL_FOOTER } from "@/lib/offerResponseShell";

/** The three magic-link screens (the Accept / Decline gate, the receipt, the expired page) share one shell, and a receipt never starts with a bullet. */

// A state job as the email intake saves it: its date lives in the schedule, `details.date` is empty.
const row = {
  id: "5a8c56a4-0000-4000-8000-000000000002",
  title: "ODHH SRN #202787900 — Capitol Clinic",
  createdAt: new Date("2026-11-26T18:00:00Z"),
  data: {
    intake: { program: "WA ODHH", odhhSrn: "202787900" },
    requester: { org: "Capitol Clinic" },
    details: { format: "Virtual", timeZone: "America/Los_Angeles", startTime: "10:00 AM", endTime: "11:30 AM" },
    schedule: { startsAt: "2026-11-26T18:00:00.000Z", endsAt: "2026-11-26T19:30:00.000Z" },
  },
};

const gate = (action: "accept" | "decline"): Promise<string> =>
  renderOfferConfirmPage({ token: "t.o.k", action, summary: { ...summarizeJob(row), offerPlace: offerPlaceOf(row) }, expiresAt: new Date("2026-11-25T17:00:00Z") }).text();
const receipt = (status: "accepted" | "declined" | "expired", details?: { title: string; date?: string; time?: string }): Promise<string> =>
  renderHtmlCard({ status, title: status === "expired" ? "Offer Expired or Invalid" : status === "declined" ? "Offer Declined" : "Offer Accepted", message: "Done.", jobDetails: details }).text();
const style = (html: string): string => /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

describe("one shell for all three magic-link screens", () => {
  it("every screen has the dark green TerpDESK header, the footer and the same card and styles", async () => {
    const pages = [await gate("accept"), await gate("decline"), await receipt("accepted", { title: "A" }), await receipt("declined", { title: "A" }), await receipt("expired")];
    for (const html of pages) {
      assert.ok(html.includes('<main class="card">'), "the card");
      assert.ok(/<div class="header">\s*<span class="header-title">TerpDESK<\/span>/.test(html), "the TerpDESK header bar");
      assert.ok(html.includes(`<div class="footer">\n      ${SHELL_FOOTER}`), "the footer");
      assert.ok(html.includes("TerpDesk Dispatch Automation &bull; Secure Magic Link Response"));
      assert.ok(html.includes("background-color: #163C3A"), "the dark green header colour");
      assert.ok(html.includes('class="icon-container"'), "the icon circle");
    }
    assert.equal(new Set(pages.map(style)).size, 1, "all screens carry exactly the same stylesheet");
  });
  it("the decline gate is that shell with a crisp, accessible confirm button", async () => {
    const html = await gate("decline");
    assert.ok(html.includes('<h1 class="title">Decline this job offer?</h1>'));
    assert.ok(/<button type="submit" class="btn btn-secondary">Yes, decline this offer<\/button>/.test(html));
    assert.ok(html.includes('name="action" value="decline"') && html.includes('method="POST"'));
    const css = style(html);
    assert.ok(/\.btn \{[^}]*min-height: 48px/.test(css), "a 48px touch target");
    assert.ok(/\.btn:focus-visible \{[^}]*outline: 3px/.test(css), "a visible keyboard focus ring");
    assert.ok(/\.btn-secondary \{[^}]*border: 2px solid #0B3B32/.test(css));
  });
  it("the accept gate uses the same shell and the primary button, and still asks the travel question", async () => {
    const html = await gate("accept");
    assert.ok(html.includes('<h1 class="title">Accept this job offer?</h1>'));
    assert.ok(/class="btn btn-primary">Yes, accept this job<\/button>/.test(html));
    assert.ok(html.includes("Do you need travel time?"));
  });
  it("the page is mobile-ready and kept out of search", async () => {
    const html = await receipt("expired");
    assert.ok(html.includes('name="viewport"') && html.includes("noindex"));
    assert.ok(/@media \(max-width: 480px\)/.test(style(html)));
  });
  it("job text from the database is escaped on the receipt", async () => {
    const html = await receipt("accepted", { title: "<script>alert(1)</script>", date: "<b>x</b>", time: "1 & 2" });
    assert.equal(html.includes("<script>alert"), false);
    assert.ok(html.includes("&lt;script&gt;") && html.includes("1 &amp; 2"));
  });
  it("no em-dash in what the screens say", async () => {
    for (const html of [await gate("accept"), await gate("decline"), await receipt("accepted", { title: "A", date: "Thu, Nov 26, 2026", time: "10:00 AM" }), await receipt("expired")]) assert.equal(html.includes("—"), false);
    for (const file of ["src/lib/offerResponseShell.ts", "src/lib/offerReceiptCard.ts"]) assert.equal(readFileSync(file, "utf8").includes("—"), false, file);
  });
});

describe("the receipt's Scheduled Time", () => {
  it("puts the date before the bullet", async () => {
    const html = await receipt("declined", { title: "ODHH 202787900 - Capitol Clinic", date: "Thu, Nov 26, 2026", time: "10:00 AM - 11:30 AM (PST)" });
    assert.ok(html.includes("Thu, Nov 26, 2026 &bull; 10:00 AM - 11:30 AM (PST)"));
  });
  it("never starts with a bullet when there is no date", async () => {
    const html = await receipt("declined", { title: "A", time: "10:00 AM - 11:30 AM (PST)" });
    assert.ok(html.includes(">10:00 AM - 11:30 AM (PST)<"));
    assert.equal(/>\s*&bull;/.test(html), false);
  });
  it("shows only the date when there is no time, and no Scheduled Time block when there is neither", async () => {
    assert.ok((await receipt("accepted", { title: "A", date: "Thu, Nov 26, 2026" })).includes(">Thu, Nov 26, 2026<"));
    assert.equal((await receipt("accepted", { title: "A" })).includes("Scheduled Time"), false);
  });
  it("scheduleLine joins only what is there", () => {
    assert.equal(scheduleLine("Thu, Nov 26, 2026", "10:00 AM"), "Thu, Nov 26, 2026 &bull; 10:00 AM");
    assert.equal(scheduleLine(undefined, "10:00 AM"), "10:00 AM");
    assert.equal(scheduleLine("  ", "10:00 AM"), "10:00 AM");
    assert.equal(scheduleLine("Thu, Nov 26, 2026", undefined), "Thu, Nov 26, 2026");
    assert.equal(scheduleLine(undefined, undefined), "");
  });
});

describe("receiptDateLabel", () => {
  it("reads a state job's date from its schedule, in the app's words (details.date is empty)", () => {
    assert.equal(receiptDateLabel(row, undefined), "Thu, Nov 26, 2026");
  });
  it("prefers the schedule over a differently written date on the job", () => {
    assert.equal(receiptDateLabel(row, "2026-11-26"), "Thu, Nov 26, 2026");
  });
  it("falls back to the written date when the schedule cannot be read, and to nothing when there is none", () => {
    const unreadable = { ...row, createdAt: null, data: { details: {} } };
    assert.equal(receiptDateLabel(unreadable, "Fri, Nov 27, 2026"), "Fri, Nov 27, 2026");
    assert.equal(receiptDateLabel(unreadable, "2026-11-27"), "Fri, Nov 27, 2026", "an ISO date is shown in the app's words");
    assert.equal(receiptDateLabel(unreadable, undefined), undefined);
    assert.equal(receiptDateLabel(unreadable, "  "), undefined);
  });
});
