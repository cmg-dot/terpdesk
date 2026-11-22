import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGENCY_BANNER_KINDS, SCHEDULE_BANNER_KINDS, toastKindsFor } from "@/lib/bannerKinds";
import { agencyAlertHref, agencyBannerKind } from "@/lib/lifecycleAlerts";
import type { AgencyAlertEvent } from "@/lib/lifecycleAlerts";
import { announceExpiredOffer, expiryNeedsStaff } from "@/lib/offerExpiryAlert";
import type { ExpiryEffects } from "@/lib/offerExpiryAlert";
import type { AlertToast } from "@/lib/pulse";

// The test runner compiles JSX in classic mode: the components need React in scope.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date("2026-11-23T20:00:00.000Z");
const REQUEST = "5a8c56a4-0000-4000-8000-000000000033";
const OFFER = "5a8c56a4-0000-4000-8000-0000000000c1";
const TERP = "5a8c56a4-0000-4000-8000-0000000000aa";
const noop = () => undefined;

describe("when staff are told an offer expired (Phase 33.4)", () => {
  it("only while the position can still be re-offered: the deadline passed, the appointment has not started", () => {
    const ahead = "2026-11-25T17:00:00.000Z";
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: "2026-11-23T19:59:00.000Z", startsAt: ahead }), true);
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: NOW, startsAt: ahead }), true, "the deadline instant itself counts");
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: "2026-11-23T20:01:00.000Z", startsAt: ahead }), false, "not due yet");
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: "2026-11-23T19:00:00.000Z", startsAt: "2026-11-23T19:30:00.000Z" }), false, "already started");
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: null, startsAt: ahead }), false);
    assert.equal(expiryNeedsStaff(NOW, { expiresAt: "2026-11-23T19:00:00.000Z", startsAt: "nonsense" }), false);
  });

  it("raises the staff alert for the right position and writes an agency-only history line", async () => {
    const alerts: Parameters<ExpiryEffects["alert"]>[0][] = [];
    const lines: Parameters<ExpiryEffects["activity"]>[0][] = [];
    const fx: ExpiryEffects = { alert: async (p) => void alerts.push(p), activity: async (e) => void lines.push(e) };
    await announceExpiredOffer({ offerId: OFFER, requestId: REQUEST, interpreterId: TERP, data: { offerPositions: { [OFFER]: 1 } } }, fx);
    assert.deepEqual(alerts, [{ event: "offer_expired", requestId: REQUEST, interpreterId: TERP, positionNumber: 1 }]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].audience, "agency");
    assert.equal(lines[0].kind, "offer_expired");
    assert.equal(lines[0].interpreterId, TERP);
    assert.equal(lines[0].message, "Offer expired, no answer (Position 1)");
    assert.ok(!lines[0].message.includes("—"));
  });

  it("still records the line when the interpreter is unknown, and never throws when an effect fails", async () => {
    const lines: string[] = [];
    await announceExpiredOffer({ offerId: OFFER, requestId: REQUEST, interpreterId: null, data: {} }, { alert: async () => { throw new Error("no alert without an interpreter"); }, activity: async (e) => void lines.push(e.message) });
    assert.equal(lines.length, 1);
    await announceExpiredOffer({ offerId: OFFER, requestId: REQUEST, interpreterId: TERP, data: {} }, { alert: async () => { throw new Error("db down"); }, activity: async () => undefined });
  });
});

describe("agency banners for declined and expired offers (Phase 33.4)", () => {
  it("lists all four kinds, with the old two unchanged", () => {
    assert.deepEqual([...AGENCY_BANNER_KINDS], ["offer_accepted", "offer_declined", "offer_expired", "offer_question"]);
  });

  it("an acceptance, a decline and an expiry are banners that open on Staffing; the other alerts stay bell-only", () => {
    const events: AgencyAlertEvent[] = ["offer_accepted", "offer_declined", "offer_expired", "assignment_given_back", "timesheet_submitted", "cancellation_form_submitted"];
    assert.deepEqual(events.map((e) => agencyBannerKind(e)), ["offer_accepted", "offer_declined", "offer_expired", null, null, null]);
    for (const e of events.slice(0, 3)) assert.equal(agencyAlertHref(e, REQUEST), `/requests/${REQUEST}#staffing`);
    for (const e of events.slice(3)) assert.equal(agencyAlertHref(e, REQUEST), `/requests/${REQUEST}`);
    assert.equal(agencyAlertHref("offer_declined", REQUEST, "/hours-review"), "/hours-review", "a named place wins");
  });

  it("every banner kind is also a pop-up kind for its audience, and nothing else is", () => {
    assert.deepEqual([...toastKindsFor("agency")], [...AGENCY_BANNER_KINDS]);
    assert.deepEqual([...toastKindsFor("interpreter")], [...SCHEDULE_BANNER_KINDS]);
    for (const quiet of ["timesheet_submitted", "assignment_given_back", "job_update"]) {
      assert.ok(!toastKindsFor("agency").includes(quiet) && !toastKindsFor("interpreter").includes(quiet), quiet);
    }
  });
});

describe("the floating pop-up", () => {
  const toast = (kind: string, id = kind): AlertToast => ({ id, kind, title: `Title ${kind}`, message: "A short message.", href: "/jobs", createdAt: "2026-11-23T20:00:00.000Z" });
  const render = async (toasts: AlertToast[]) => {
    const { AlertToastStack } = await import("@/components/ui/AlertToastStack");
    return renderToStaticMarkup(React.createElement(AlertToastStack, { toasts, onOpen: noop, onClose: noop }));
  };

  it("shows each kind the audiences get, with its own title and message, a close button and a polite live region", async () => {
    const kinds = [...AGENCY_BANNER_KINDS, ...SCHEDULE_BANNER_KINDS];
    const html = await render(kinds.map((k) => toast(k)));
    for (const kind of kinds) assert.ok(html.includes(`data-alert-toast="${kind}"`) && html.includes(`Title ${kind}`) && html.includes(`aria-label="Dismiss: Title ${kind}"`), kind);
    assert.ok(html.includes('aria-live="polite"') && html.includes('aria-label="New alerts"') && html.includes("fixed bottom-4 right-4"));
    assert.ok(!html.includes("—"));
  });

  it("sits in a full-width strip on a phone, and is an empty region when there is nothing new", async () => {
    const html = await render([]);
    assert.ok(html.includes("max-sm:inset-x-4") && html.includes("data-alert-toasts"));
    assert.ok(!html.includes("data-alert-toast="));
  });
});

describe("the offer card layout (Phase 33.2)", () => {
  const job = {
    id: "offer-1", status: "pending", title: "ODHH SRN #202787460 - Seattle Children's Hospital",
    startsAt: "2026-11-24T17:00:00.000Z", endsAt: "2026-11-24T19:00:00.000Z", timeZone: "America/Los_Angeles",
    offerExpiresAt: "2026-11-24T01:00:00.000Z", isVirtual: false, onsite: { venue: "Legacy Salmon Creek", address: "4800 Sand Point Way NE" },
  };
  const card = async () => {
    const { HomeOfferCard } = await import("@/components/interpreter/HomeOfferCard");
    return renderToStaticMarkup(React.createElement(HomeOfferCard, { job, accepting: false, onAccept: noop, onDecline: async () => undefined }));
  };

  it("gives the details the whole width and the four buttons a full-width row of their own below them", async () => {
    const html = await card();
    assert.ok(html.includes("data-home-offer-actions"));
    assert.match(html, /class="w-full flex flex-wrap items-center gap-2 pt-3 border-t[^"]*" data-home-offer-actions/);
    assert.match(html, /class="[^"]*min-w-0 flex-1 break-words/, "the details column can shrink and fills the card");
    assert.match(html, /class="bg-\[var\(--canvas\)\] rounded-xl p-4 flex flex-col gap-3/, "the card stacks the details above the actions");
    assert.ok(!html.includes("shrink-0 md:w-auto"), "the actions are no longer a fixed-width block beside the details");
    assert.ok(!/md:flex-row/.test(html.split("data-home-offer-actions")[0]), "no side-by-side layout on desktop");
  });

  it("keeps all four actions, in order, with the heading's words unchanged", async () => {
    const html = await card();
    const order = ["Ask a question", "Decline", "Review", "Accept"].map((label) => html.indexOf(`>${label}<`));
    assert.ok(order.every((i) => i > 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(html.includes("Offer received: ODHH SRN #202787460"));
  });

  it("the Decline confirmation takes a full row of its own at the end of the button row", async () => {
    const { OfferDeclineView } = await import("@/components/interpreter/OfferDeclineControl");
    const html = renderToStaticMarkup(React.createElement(OfferDeclineView, { confirming: true, busy: false, error: null, onAsk: noop, onConfirm: noop, onCancel: noop }));
    assert.match(html, /class="order-last flex w-full basis-full flex-wrap/);
    assert.ok(html.includes("Decline this offer?") && html.includes("Yes, decline") && html.includes(">Cancel<"));
    assert.ok(!html.includes("<textarea") && !html.includes("<input"), "no reason box");
  });
});
