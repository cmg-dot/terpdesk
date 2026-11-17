import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarFrom } from "@/lib/billing/businessCalendar";
import { jobFacts } from "@/lib/billing/facts";
import type { FactsContext, RawRequest } from "@/lib/billing/facts";
import { jobLedger } from "@/lib/billing/lines";
import { amounts, settings } from "./fixtures";

/**
 * The $10 onsite / commercial auto fee: billed to the client per position on every completed in-person State/HCA job, and paid to
 * the interpreter only when they hold a commercial auto policy that is current on the service date (the existing profile check).
 * Kari's four interpreters with commercial auto: Alecia Knust, David Rice, Shelly Hansen and Amanda Wilkes.
 */
const FOUR = [
  ["a1111111-1111-4111-8111-111111111111", "Alecia Knust"],
  ["a2222222-2222-4222-8222-222222222222", "David Rice"],
  ["a3333333-3333-4333-8333-333333333333", "Shelly Hansen"],
  ["a4444444-4444-4444-8444-444444444444", "Amanda Wilkes"],
] as const;
const WITHOUT = "a5555555-5555-4555-8555-555555555555";
const EXPIRED = "a6666666-6666-4666-8666-666666666666";
const ALL = [...FOUR.map(([id]) => id), WITHOUT, EXPIRED];

const context = (): FactsContext => ({
  settings: settings(),
  calendar: calendarFrom(settings(), []),
  names: new Map<string, string>([...FOUR, [WITHOUT, "No Policy"], [EXPIRED, "Old Policy"]]),
  rates: new Map(ALL.map((id) => [id, { stateCents: 6000, kingCountyCents: null, nonStateCents: 6800, eveningCents: null }])),
  // Policies valid through the service date (or later); the expired one lapsed the day before.
  commercialAutoUntil: new Map<string, string>([...FOUR.map(([id]) => [id, "2027-03-31"] as [string, string]), [EXPIRED, "2026-10-14"]]),
  clients: [],
});

/** One in-person team job with every interpreter above in their own position, all hours approved. */
function teamJob(format: string, program: string): RawRequest {
  const hours: Record<number, Record<string, unknown>> = {};
  ALL.forEach((id, i) => {
    hours[i + 1] = { status: "approved", interpreterId: id, actualStartTime: "2026-10-15T16:00:00.000Z", actualEndTime: "2026-10-15T18:00:00.000Z" };
  });
  return {
    id: "b1111111-1111-4111-8111-111111111111",
    status: "completed",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    canceledAt: null,
    isStateJob: program !== "General",
    billingStatus: null,
    data: {
      brief: {},
      intake: { program },
      details: { format, timeZone: "America/Los_Angeles", startDate: "2026-10-15", startTime: "09:00", endTime: "11:00", slotCount: ALL.length },
      onsite: { venue: "Clinic", address: "100 Main St, Kent, WA 98032" },
      hoursSubmissions: hours,
    },
  };
}

const ledgerFor = (format: string, program: string) => {
  const facts = jobFacts(teamJob(format, program), [], [], context());
  assert.ok(facts);
  return jobLedger(facts, settings());
};

describe("commercial auto +$10", () => {
  it("pays the four commercial auto interpreters +$10 on an in-person State job", () => {
    const l = ledgerFor("In person", "WA ODHH");
    for (const [id, name] of FOUR) {
      const p = l.positions.find((x) => x.interpreterId === id);
      assert.ok(p, name);
      assert.equal(amounts(p.pay).commercial_auto, 1000, name);
    }
  });

  it("pays nothing extra without a current policy on the service date, but the client is still billed the onsite fee", () => {
    const l = ledgerFor("In person", "WA ODHH");
    for (const id of [WITHOUT, EXPIRED]) {
      const p = l.positions.find((x) => x.interpreterId === id);
      assert.ok(p);
      assert.equal(amounts(p.pay).commercial_auto, undefined);
      assert.equal(amounts(p.bill).onsite_fee, 1000);
    }
    // One onsite fee and one vendor fee per position.
    assert.equal(l.positions.reduce((n, p) => n + (amounts(p.bill).onsite_fee ?? 0), 0), 1000 * ALL.length);
    assert.equal(l.positions.reduce((n, p) => n + (amounts(p.bill).vendor_fee ?? 0), 0), 7500 * ALL.length);
  });

  it("applies to Apple Health too", () => {
    const l = ledgerFor("In person", "WA Apple Health");
    assert.equal(amounts(l.positions[0].pay).commercial_auto, 1000);
  });

  it("never on a virtual job", () => {
    const l = ledgerFor("Virtual", "WA ODHH");
    assert.equal(l.positions.some((p) => p.pay.some((x) => x.kind === "commercial_auto") || p.bill.some((x) => x.kind === "onsite_fee")), false);
  });

  it("never on a Non-state job", () => {
    const l = ledgerFor("In person", "General");
    assert.equal(l.positions.some((p) => p.pay.some((x) => x.kind === "commercial_auto") || p.bill.some((x) => x.kind === "onsite_fee")), false);
  });
});
