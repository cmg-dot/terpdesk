import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eveningMinutesIn, splitTravel } from "@/lib/billing/evening";
import { jobLedger } from "@/lib/billing/lines";
import { amounts, job, position, rates, settings } from "./fixtures";

/** Travel time at the job's rate, with the minutes inside the evening window (when set) at the interpreter's evening rate. */
const ZONE = "America/Los_Angeles";
const EVENING = { startMinute: 18 * 60, endMinute: 6 * 60 }; // 6:00 PM to 6:00 AM, wraps midnight
// 2026-10-15 is PDT (UTC-7).
const window = (startLocal: string, endLocal: string) => ({ start: new Date(`${startLocal}-07:00`).toISOString(), end: new Date(`${endLocal}-07:00`).toISOString() });

describe("evening travel split", () => {
  it("counts the minutes inside the evening window", () => {
    assert.equal(eveningMinutesIn(window("2026-10-15T17:00", "2026-10-15T19:00"), ZONE, EVENING.startMinute, EVENING.endMinute), 60);
    assert.equal(eveningMinutesIn(window("2026-10-15T05:00", "2026-10-15T07:00"), ZONE, EVENING.startMinute, EVENING.endMinute), 60);
    assert.equal(eveningMinutesIn(window("2026-10-15T09:00", "2026-10-15T11:00"), ZONE, EVENING.startMinute, EVENING.endMinute), 0);
    assert.equal(eveningMinutesIn(window("2026-10-15T23:00", "2026-10-16T01:00"), ZONE, EVENING.startMinute, EVENING.endMinute), 120);
  });

  it("keeps the window's share when staff approved a different number of minutes", () => {
    const w = window("2026-10-15T17:00", "2026-10-15T19:00");
    assert.deepEqual(splitTravel(120, w, ZONE, { ...EVENING, rateSet: true }), { dayMinutes: 60, eveningMinutes: 60 });
    assert.deepEqual(splitTravel(60, w, ZONE, { ...EVENING, rateSet: true }), { dayMinutes: 30, eveningMinutes: 30 });
  });

  it("is all day travel without an evening rate, an evening window or a submitted window", () => {
    const w = window("2026-10-15T17:00", "2026-10-15T19:00");
    assert.deepEqual(splitTravel(120, w, ZONE, { ...EVENING, rateSet: false }), { dayMinutes: 120, eveningMinutes: 0 });
    assert.deepEqual(splitTravel(120, w, ZONE, { startMinute: null, endMinute: null, rateSet: true }), { dayMinutes: 120, eveningMinutes: 0 });
    assert.deepEqual(splitTravel(120, null, ZONE, { ...EVENING, rateSet: true }), { dayMinutes: 120, eveningMinutes: 0 });
  });
});

describe("travel on the ledger", () => {
  const evening = settings({ eveningStartMinute: EVENING.startMinute, eveningEndMinute: EVENING.endMinute });

  it("State job: travel billed and paid at the job's rate, evening minutes at the evening rate", () => {
    const l = jobLedger(
      job({ positions: [position({ workedMinutes: 120, travelMinutes: 120, travelWindow: window("2026-10-15T17:00", "2026-10-15T19:00"), rates: rates({ stateCents: 6000, eveningCents: 7500 }) })] }),
      evening,
    );
    const pay = amounts(l.positions[0].pay);
    assert.equal(pay.travel, 6000);
    assert.equal(pay.travel_evening, 7500);
    assert.equal(amounts(l.positions[0].bill).travel_evening, 7500);
  });

  it("uses the King County rate for travel in King County", () => {
    const l = jobLedger(
      job({ inPerson: true, kingCounty: { value: true, source: "auto", matched: "98104" }, positions: [position({ workedMinutes: 120, travelMinutes: 60, rates: rates({ stateCents: 6000, kingCountyCents: 7000 }) })] }),
      settings(),
    );
    assert.equal(amounts(l.positions[0].pay).travel, 7000);
  });

  it("Non-state: the client is billed its own rate for evening travel; the interpreter is paid the evening rate", () => {
    const l = jobLedger(
      job({ category: "non_state", positions: [position({ workedMinutes: 120, travelMinutes: 60, travelWindow: window("2026-10-15T18:00", "2026-10-15T19:00"), rates: rates({ nonStateCents: 6800, eveningCents: 8000 }) })] }),
      evening,
    );
    assert.equal(amounts(l.positions[0].bill).travel_evening, 9500);
    assert.equal(amounts(l.positions[0].pay).travel_evening, 8000);
  });
});
