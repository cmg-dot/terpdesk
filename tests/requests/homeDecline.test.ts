import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DECLINE_FAILED, runDecline } from "@/lib/declineFlow";

// The test runner compiles JSX in classic mode: the components need React in scope.
(globalThis as { React?: typeof React }).React = React;

const noop = () => undefined;
const view = async (props: Partial<{ confirming: boolean; busy: boolean; error: string | null }>) => {
  const { OfferDeclineView } = await import("@/components/interpreter/OfferDeclineControl");
  return renderToStaticMarkup(React.createElement(OfferDeclineView, { confirming: false, busy: false, error: null, onAsk: noop, onConfirm: noop, onCancel: noop, ...props }));
};

describe("declining from Home: the answer", () => {
  it("calls the decline with the offer's id and reports success", async () => {
    const seen: string[] = [];
    assert.deepEqual(await runDecline(async (id) => void seen.push(id), "offer-1"), { ok: true });
    assert.deepEqual(seen, ["offer-1"]);
  });

  it("turns a refusal into the server's own words, and an empty or odd one into a fixed message", async () => {
    assert.deepEqual(await runDecline(async () => { throw new Error("This offer has expired."); }, "o"), { ok: false, error: "This offer has expired." });
    assert.deepEqual(await runDecline(async () => { throw new Error("  "); }, "o"), { ok: false, error: DECLINE_FAILED });
    assert.deepEqual(await runDecline(async () => { throw "nope"; }, "o"), { ok: false, error: DECLINE_FAILED });
  });
});

describe("declining from Home: the control", () => {
  it("starts as a Decline button, with no question showing", async () => {
    const html = await view({});
    assert.ok(html.includes("data-offer-decline"));
    assert.ok(html.includes(">Decline<"));
    assert.ok(!html.includes("Decline this offer?"));
  });

  it("asks 'Decline this offer?' with Yes, decline and Cancel, and no place to type a reason", async () => {
    const html = await view({ confirming: true });
    assert.ok(html.includes("Decline this offer?") && html.includes("Yes, decline") && html.includes("Cancel"));
    assert.ok(!/<(?:textarea|input)\b/i.test(html), "no free-text field, so nothing about the client can be typed");
  });

  it("disables both buttons while declining, and shows a refusal as an alert", async () => {
    const busy = await view({ confirming: true, busy: true });
    assert.ok(busy.includes("Declining...") && (busy.match(/disabled=""/g) ?? []).length === 2);
    const refused = await view({ confirming: true, error: "This offer has expired." });
    assert.ok(refused.includes('role="alert"') && refused.includes("This offer has expired."));
  });
});

describe("the Home offer card", () => {
  const offer = {
    id: "offer-1",
    status: "pending",
    title: "ODHH 202787460 - Seattle Children's Hospital",
    startsAt: "2026-11-24T17:00:00.000Z",
    endsAt: "2026-11-24T19:00:00.000Z",
    timeZone: "America/Los_Angeles",
    isVirtual: false,
    onsite: { venue: "OTOLARYNGOLOGY CLINIC", room: "Ocean 8", address: "4800 Sand Point Way NE, Seattle, WA 98105" },
    offerExpiresAt: "2026-11-24T01:00:00.000Z",
  };

  it("has Ask a question, Decline, Review and Accept, and the header, clinic and street address", async () => {
    const { HomeOfferCard } = await import("@/components/interpreter/HomeOfferCard");
    const html = renderToStaticMarkup(React.createElement(HomeOfferCard, { job: offer, accepting: false, onAccept: noop, onDecline: async () => undefined }));
    for (const label of ["Ask a question", ">Decline<", ">Review<", ">Accept<"]) assert.ok(html.includes(label), label);
    assert.ok(html.includes("Offer received: ODHH 202787460 - Seattle Children&#x27;s Hospital") || html.includes("Offer received: ODHH 202787460 - Seattle Children's Hospital"));
    assert.ok(html.includes("OTOLARYNGOLOGY CLINIC") && html.includes("4800 Sand Point Way NE"));
    assert.ok(html.includes('href="/jobs/offer-1"'));
    assert.ok(!/—/.test(html), "no em-dash in the card's text");
  });

  it("shows Accepting... on the Accept button while it works, and leaves Decline in place", async () => {
    const { HomeOfferCard } = await import("@/components/interpreter/HomeOfferCard");
    const html = renderToStaticMarkup(React.createElement(HomeOfferCard, { job: offer, accepting: true, onAccept: noop, onDecline: async () => undefined }));
    assert.ok(html.includes("Accepting...") && html.includes("data-offer-decline"));
  });
});
