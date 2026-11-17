import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobLedger } from "@/lib/billing/lines";
import { clientBillingOf } from "@/lib/billing/settings";
import type { ClientBilling } from "@/lib/billing/types";
import { amounts, job, position, rates, settings } from "./fixtures";

/** Non-state organizations: client rate billed, interpreter's Non-state rate paid, 2-hour minimum, then 30-minute (or 15) steps. */
const DEFAULT_TERMS: ClientBilling = { rateCents: null, roundingMinutes: null };
const TACOMA: ClientBilling = { rateCents: 8500, roundingMinutes: 15 };
const YAKIMA: ClientBilling = { rateCents: 9900, roundingMinutes: null };

const bill = (worked: number, billing: ClientBilling) =>
  jobLedger(
    job({
      category: "non_state",
      inPerson: true,
      client: { id: "c1", name: "Client", billing },
      positions: [position({ workedMinutes: worked, rates: rates({ nonStateCents: 6800 }) })],
    }),
    settings(),
  );

describe("Non-state client rates and rounding", () => {
  it("default $95/hr: 70 minutes is raised to the 2-hour minimum ($190.00)", () => {
    const l = bill(70, DEFAULT_TERMS);
    assert.equal(l.billTotalCents, 19000);
    assert.equal(l.positions[0].bill[0].label, "Service (2 hr minimum)");
  });

  it("default $95/hr rounds up to 30 minutes after the minimum: 2 hr 05 min -> 2.5 hr ($237.50)", () => {
    assert.equal(bill(125, DEFAULT_TERMS).billTotalCents, 23750);
    assert.equal(bill(150, DEFAULT_TERMS).billTotalCents, 23750);
    assert.equal(bill(151, DEFAULT_TERMS).billTotalCents, 28500);
  });

  it("Tacoma Schools (TSD) $85/hr in 15-minute steps: 2 hr 05 min -> 2.25 hr ($191.25); 2 hr 20 min -> 2.5 hr ($212.50)", () => {
    assert.equal(bill(125, TACOMA).billTotalCents, 19125);
    assert.equal(bill(140, TACOMA).billTotalCents, 21250);
    assert.equal(bill(60, TACOMA).billTotalCents, 17000);
  });

  it("Yakima Schools $99/hr in the default 30-minute steps: 2 hr 05 min -> 2.5 hr ($247.50)", () => {
    assert.equal(bill(125, YAKIMA).billTotalCents, 24750);
  });

  it("pays the interpreter's Non-state rate on the same billed time, and never a vendor fee, onsite fee or 1.5x", () => {
    const l = bill(125, TACOMA);
    assert.equal(l.payTotalCents, Math.round((135 * 6800) / 60));
    const kinds = Object.keys(amounts(l.positions[0].bill));
    assert.deepEqual(kinds, ["service"]);
  });

  it("flags a missing Non-state pay rate instead of guessing", () => {
    const l = jobLedger(job({ category: "non_state", positions: [position({ workedMinutes: 120 })] }), settings());
    assert.equal(l.payTotalCents, 0);
    assert.match(l.positions[0].warnings[0], /No Non-state rate/);
  });

  it("reads a client's own terms from clients.data.billing", () => {
    assert.deepEqual(clientBillingOf({ billing: { rate: 85, roundingMinutes: 15 } }), TACOMA);
    assert.deepEqual(clientBillingOf({ billing: { rate: "99.00" } }), YAKIMA);
    assert.deepEqual(clientBillingOf({ contacts: [] }), DEFAULT_TERMS);
    assert.deepEqual(clientBillingOf({ billing: { rate: -5, roundingMinutes: 20 } }), DEFAULT_TERMS);
  });

  it("bills approved mileage at $0.76/mi on a completed job", () => {
    const l = jobLedger(job({ category: "non_state", positions: [position({ workedMinutes: 120, approvedMiles: 12.5, rates: rates({ nonStateCents: 6800 }) })] }), settings());
    assert.equal(amounts(l.positions[0].bill).mileage, 950);
    assert.equal(amounts(l.positions[0].pay).mileage, 950);
  });
});
