import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { escapeHtml } from "@/lib/emailTemplate";
import { interpreterJobView } from "@/lib/interpreterJobData";
import { jobHeadline } from "@/lib/jobHeadline";
import { summarizeJob } from "@/lib/jobSummary";
import { renderOfferConfirmPage } from "@/lib/offerConfirmPage";
import { offerPlaceOf } from "@/lib/offerPlace";

// The test runner compiles JSX in classic mode: the components need React in scope.
(globalThis as { React?: typeof React }).React = React;

const HEADLINE = "ODHH 202787460 - Seattle Children's Hospital";
const CLINIC = "OTOLARYNGOLOGY CLINIC · Ocean 8";
const ADDRESS = "4800 Sand Point Way NE, Seattle, WA 98105";
/** Made-up values that must never reach an offer surface. */
const SECRETS = ["Test Client Person", "123456789WA", "PA-777123", "1990-04-12", "STAFF ONLY NOTE"];

const job = {
  id: "5a8c56a4-0000-4000-8000-000000000001",
  title: "ODHH SRN #202787460 — OTOLARYNGOLOGY CLINIC - OCEAN 8",
  createdAt: new Date("2026-11-24T17:00:00Z"),
  data: {
    intake: { program: "WA ODHH", odhhSrn: "202787460", providerOneNumber: "123456789WA", priorAuthNumber: "PA-777123", clientDob: "1990-04-12" },
    requester: { org: "Seattle Children's Hospital", billOrg: "Seattle Children's Hospital", name: "Requester Person", email: "req@example.org" },
    details: { format: "In person", deafParticipant: "Test Client Person", timeZone: "America/Los_Angeles" },
    onsite: { venue: "OTOLARYNGOLOGY CLINIC", room: "Ocean 8", address: ADDRESS, parking: "Gate code 4411", contact: "Front desk" },
    schedule: { startsAt: "2026-11-24T17:00:00.000Z", endsAt: "2026-11-24T18:00:00.000Z" },
    privateNotes: "STAFF ONLY NOTE",
  },
};
const view = interpreterJobView(job.data, "offer");
// What getInterpreterOffers sends the app as the offer's title.
const appTitle = jobHeadline({ srn: view.data.intake.odhhSrn, organization: view.organization, venue: view.onsite.venue, title: job.title });
const appJob = { ...view, id: "offer-1", status: "pending", title: appTitle, startsAt: "2026-11-24T17:00:00.000Z", endsAt: "2026-11-24T18:00:00.000Z" };
const noSecrets = (html: string) => {
  for (const secret of SECRETS) assert.ok(!html.includes(secret), `leaked: ${secret}`);
  assert.ok(!html.includes("Gate code 4411") && !html.includes("Front desk"), "parking / on-site contact are for booked interpreters only");
};

describe("Home's pending offer card", () => {
  it("heads the card 'Offer received — ODHH <SRN> - <organization>' with the clinic and the street address under it", async () => {
    const { OfferSummaryLines } = await import("@/components/interpreter/OfferSummaryLines");
    assert.equal(appTitle, HEADLINE);
    const html = renderToStaticMarkup(React.createElement(OfferSummaryLines, { job: appJob }));
    assert.ok(html.includes(escapeHtml(CLINIC)));
    assert.ok(html.includes(ADDRESS));
    noSecrets(`${appTitle}${html}`);
  });
});

describe("the app's job page, pending offer", () => {
  it("names the place and its street address in the on-site card, and keeps parking and the contact back", async () => {
    const { JobPlaceCards } = await import("@/components/interpreter/JobPlaceCards");
    const html = renderToStaticMarkup(React.createElement(JobPlaceCards, { job: appJob }));
    assert.ok(html.includes(escapeHtml(CLINIC)));
    assert.ok(html.includes(ADDRESS));
    assert.ok(view.location.includes(ADDRESS), "the Overview's Location line carries the address too");
    noSecrets(html);
  });

  it("sends nothing private in the offer's data at all", () => {
    noSecrets(JSON.stringify(view));
    assert.equal(view.clientName, null);
  });
});

describe("the private offer link page", () => {
  const page = async (data: unknown) => {
    const row = { ...job, data };
    const res = renderOfferConfirmPage({ token: "t.o.k", action: "accept", summary: { ...summarizeJob(row), offerPlace: offerPlaceOf(row) }, expiresAt: new Date("2026-11-23T17:00:00Z") });
    return res.text();
  };

  it("shows the same header, the clinic and the street address", async () => {
    const html = await page(job.data);
    assert.ok(html.includes(escapeHtml(HEADLINE)));
    assert.ok(html.includes(escapeHtml(CLINIC)));
    assert.ok(html.includes(escapeHtml(ADDRESS)));
    noSecrets(html);
  });

  it("on a virtual offer shows only that it is virtual and its platform, never a place or a link", async () => {
    const virtual = { ...job.data, details: { ...job.data.details, format: "Virtual", platform: "Zoom", meetingLink: "https://zoom.us/j/123" } };
    const html = await page(virtual);
    assert.ok(html.includes("Virtual · Zoom"));
    assert.ok(!html.includes(ADDRESS) && !html.includes("zoom.us/j/123"));
    noSecrets(html);
  });
});
