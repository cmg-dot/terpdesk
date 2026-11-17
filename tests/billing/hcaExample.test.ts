import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarFrom } from "@/lib/billing/businessCalendar";
import { jobFacts } from "@/lib/billing/facts";
import type { FactsContext } from "@/lib/billing/facts";
import { jobLedger } from "@/lib/billing/lines";
import { amounts, job, position, rates, settings } from "./fixtures";

/**
 * Kari's sample: invoice #55599 for SRN #202786075 (Apple Health, virtual). Booked 4:00-5:30 PM, actual 4:07-4:57 PM (50 minutes),
 * interpreter rate $94.00. Billed: 2 units x $94.00 = $188.00 (1.5-hour minimum + 0.5 for the 1.5x first hour) + $75.00 vendor fee =
 * $263.00. The client's details on the real invoice are PHI and are NOT used here: these are made up.
 */
const INTERPRETER = "33333333-3333-4333-8333-333333333333";

const context = (): FactsContext => ({
  settings: settings(),
  calendar: calendarFrom(settings(), []),
  names: new Map([[INTERPRETER, "Sample Interpreter"]]),
  rates: new Map([[INTERPRETER, rates({ stateCents: 9400 })]]),
  commercialAutoUntil: new Map(),
  clients: [],
});

const hcaRequest = () => ({
  id: "44444444-4444-4444-8444-444444444444",
  status: "completed",
  createdAt: new Date("2026-10-10T17:00:00Z"),
  canceledAt: null,
  isStateJob: true,
  billingStatus: null,
  data: {
    brief: {},
    intake: { program: "WA Apple Health", odhhSrn: "202786075", providerOneNumber: "000000000WA", priorAuthNumber: "000000000", clientDob: "1990-01-01", billingModifier: "U3" },
    details: { format: "Virtual", timeZone: "America/Los_Angeles", deafParticipant: "Test Client", startDate: "2026-10-15", startTime: "16:00", endTime: "17:30" },
    offerPositions: { "55555555-5555-4555-8555-555555555555": 1 },
    hoursSubmissions: {
      1: { status: "approved", interpreterId: INTERPRETER, actualStartTime: "2026-10-15T23:07:00.000Z", actualEndTime: "2026-10-15T23:57:00.000Z", breakMinutes: 0, approvedMileage: 0 },
    },
  },
});

describe("Kari's HCA example #55599 / SRN #202786075", () => {
  it("bills $263.00: 2.0 units x $94.00 + $75.00 vendor fee", () => {
    const facts = jobFacts(hcaRequest(), [{ id: "55555555-5555-4555-8555-555555555555", interpreterId: INTERPRETER, status: "accepted", updatedAt: new Date() }], [], context());
    assert.ok(facts);
    assert.equal(facts.category, "hca");
    assert.equal(facts.reference, "SRN #202786075");
    assert.equal(facts.inPerson, false);
    assert.equal(facts.positions[0].workedMinutes, 50);
    const ledger = jobLedger(facts, settings());
    const [p] = ledger.positions;
    assert.equal(p.billedUnits, 2);
    assert.deepEqual(amounts(p.bill), { service: 14100, base_add_on: 4700, vendor_fee: 7500 });
    assert.equal(ledger.billTotalCents, 26300);
    // The interpreter is paid the same units at their own rate; the vendor fee is the agency's.
    assert.equal(ledger.payTotalCents, 18800);
  });

  it("carries the ProviderOne fields for the invoice (and only for HCA)", () => {
    const facts = jobFacts(hcaRequest(), [], [], context());
    assert.ok(facts?.hca);
    assert.equal(facts.hca.dob, "01/01/1990");
    assert.equal(facts.hca.modifier, "U3");
    assert.equal(facts.hca.providerOne, "000000000WA");
  });

  it("4 hours + 2 hours travel on a State job = 6.5 billed units", () => {
    const ledger = jobLedger(job({ positions: [position({ workedMinutes: 240, travelMinutes: 120, rates: rates({ stateCents: 9400 }) })] }), settings());
    const [p] = ledger.positions;
    assert.equal(p.billedUnits, 4.5);
    const units = p.bill.filter((l) => l.unit === "hr").reduce((n, l) => n + l.quantity, 0);
    assert.equal(units, 6.5);
    assert.equal(ledger.billTotalCents, 6.5 * 9400 + 7500);
  });

  it("State minimum and 15-minute rounding: 1 hour worked = 1.5 + 0.5; 2 hr 05 min = 2.25 + 0.5", () => {
    const at = (worked: number) => jobLedger(job({ positions: [position({ workedMinutes: worked, rates: rates({ stateCents: 6000 }) })] }), settings()).positions[0].billedUnits;
    assert.equal(at(60), 2);
    assert.equal(at(125), 2.75);
    assert.equal(at(90), 2);
  });

  it("never adds the 1.5x to a Non-state job (the two rules are exclusive)", () => {
    const ledger = jobLedger(job({ category: "non_state", positions: [position({ workedMinutes: 50, rates: rates({ nonStateCents: 6000 }) })] }), settings());
    assert.equal(ledger.positions[0].bill.some((l) => l.kind === "base_add_on"), false);
    assert.equal(ledger.positions[0].billedUnits, 2);
  });
});
