import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { payrollCsv } from "@/lib/billing/csv";
import { waStateHolidays } from "@/lib/billing/holidays";
import { sameAmount } from "@/lib/billing/money";
import { defaultPeriod, periodFor, pickerPeriods, resolvePeriod, standardHalves } from "@/lib/billing/payPeriods";
import type { PayPeriod } from "@/lib/billing/payPeriods";

describe("WA state holidays", () => {
  it("2026 and 2027, as observed", () => {
    assert.deepEqual(waStateHolidays(2026).map((h) => h.date), [
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-11", "2026-11-26", "2026-11-27", "2026-12-25",
    ]);
    assert.deepEqual(waStateHolidays(2027).map((h) => h.date), [
      "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-11", "2027-11-25", "2027-11-26", "2027-12-24", "2027-12-31",
    ]);
  });

  it("matches the list 0013_billing.sql seeds", () => {
    const sqlText = readFileSync(path.join(process.cwd(), "src/db/migrations/manual/0013_billing.sql"), "utf8");
    const seeded = Array.from(sqlText.matchAll(/\('agency-1', '(\d{4}-\d{2}-\d{2})', '((?:[^']|'')+)'\)/g)).map((m) => `${m[1]} ${m[2].replace(/''/g, "'")}`);
    const generated = [...waStateHolidays(2026), ...waStateHolidays(2027)].map((h) => `${h.date} ${h.label}`);
    assert.deepEqual(seeded, generated);
  });
});

describe("semi-monthly pay periods", () => {
  const saved: PayPeriod[] = [{ id: "p1", start: "2026-11-01", end: "2026-11-15", cutoffAt: "2026-11-19T20:00:00.000Z", payDate: "2026-11-30", saved: true }];

  it("splits a month at the 15th", () => {
    assert.deepEqual(standardHalves(2026, 2).map((p) => [p.start, p.end]), [["2026-02-01", "2026-02-15"], ["2026-02-16", "2026-02-28"]]);
  });

  it("prefers a saved period over the standard half", () => {
    assert.equal(periodFor("2026-11-10", saved).id, "p1");
    assert.equal(periodFor("2026-11-20", saved).id, "std:2026-11-16");
  });

  it("opens on the most recent period that has ended", () => {
    assert.equal(defaultPeriod("2026-11-18", saved).id, "p1");
    assert.equal(defaultPeriod("2026-11-05", saved).id, "std:2026-10-16");
  });

  it("offers saved periods without the standard halves they replace", () => {
    const ids = pickerPeriods("2026-11-18", saved, 1, 0).map((p) => p.id);
    assert.deepEqual(ids, ["std:2026-11-16", "p1", "std:2026-10-16", "std:2026-10-01"]);
  });

  it("resolves only known period ids", () => {
    assert.equal(resolvePeriod("std:2026-02-16", [])?.end, "2026-02-28");
    assert.equal(resolvePeriod("std:2026-02-10", []), null);
    assert.equal(resolvePeriod("nonsense", []), null);
  });
});

describe("typed amounts", () => {
  it("treats 85 and 85.00 as the same amount, and empty only as empty", () => {
    assert.equal(sameAmount("85", "85.00"), true);
    assert.equal(sameAmount("85.5", "85.50"), true);
    assert.equal(sameAmount("85", "85.01"), false);
    assert.equal(sameAmount("", ""), true);
    assert.equal(sameAmount("", "0"), false);
  });
});

describe("CSV export", () => {
  it("escapes cells a spreadsheet would run as a formula", () => {
    const csv = payrollCsv([
      { interpreterId: "x", interpreterName: "=HYPERLINK(\"evil\")", totalCents: 1000, rows: [{ requestId: "r", reference: "APT-1", serviceDate: "2026-11-02", placeLabel: "Kent", category: "state", outcome: "completed", positionId: 1, totalCents: 1000, lines: [{ kind: "commercial_auto", label: "Commercial auto (in person)", quantity: 1, unit: "each", rateCents: 1000, amountCents: 1000 }] }] },
    ]);
    assert.ok(!/^=|\n=/.test(csv));
    assert.match(csv, /'=HYPERLINK/);
    assert.match(csv, /10\.00/);
  });
});
