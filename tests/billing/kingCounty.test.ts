import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addressCity } from "@/lib/billing/facts";
import { detectKingCounty } from "@/lib/billing/kingCounty";
import { jobLedger } from "@/lib/billing/lines";
import { job, position, rates, settings } from "./fixtures";

const kc = (...texts: string[]) => detectKingCounty(texts).kingCounty;

describe("King County detection", () => {
  it("knows the King County cities Kari listed", () => {
    for (const city of ["Seattle", "Bellevue", "Kent", "Renton", "Federal Way", "Kirkland", "Redmond", "Auburn", "Shoreline", "Burien", "Tukwila", "SeaTac", "Issaquah", "Sammamish", "Mercer Island", "Bothell", "Woodinville", "Des Moines"]) {
      assert.equal(kc(`100 Main St, ${city}, WA`), true, city);
    }
  });

  it("decides by ZIP code first, which settles split cities", () => {
    assert.equal(kc("1200 Harbor Crest Ave, Seattle, WA 98104"), true);
    assert.equal(kc("18000 Bothell Way, Bothell, WA 98011"), true);
    assert.equal(kc("18000 Bothell Way, Bothell, WA 98012"), false);
    assert.equal(kc("2150 Fir Street, Tacoma, WA 98402"), false);
    assert.equal(kc("Yakima, WA 98901"), false);
    assert.equal(detectKingCounty(["880 Cedar Ridge Blvd, Bellevue, WA 98004"]).matched, "98004");
  });

  it("matches a whole place name only, not a venue that contains one", () => {
    assert.equal(kc("Seattle Children's Clinic, Tacoma, WA"), false);
    assert.equal(kc("Kent Station"), false);
    assert.equal(kc("Kent WA"), true);
    assert.equal(kc("Main Library", "Renton"), true);
    assert.equal(kc(""), false);
  });

  it("reads the city for the payroll place label", () => {
    assert.equal(addressCity("1200 Harbor Crest Ave, Seattle, WA 98104"), "Seattle");
    assert.equal(addressCity("2150 Fir Street, Tacoma WA 98402"), "Tacoma");
  });
});

describe("King County rate", () => {
  const inKing = { value: true, source: "auto" as const, matched: "98104" };

  it("pays and bills the King County rate on a King County State job", () => {
    const l = jobLedger(job({ inPerson: true, kingCounty: inKing, positions: [position({ workedMinutes: 120, rates: rates({ stateCents: 6000, kingCountyCents: 7000 }) })] }), settings());
    assert.equal(l.positions[0].bill[0].rateCents, 7000);
    assert.equal(l.positions[0].pay[0].rateCents, 7000);
  });

  it("falls back to the State rate, with a warning, when no King County rate is on file", () => {
    const l = jobLedger(job({ inPerson: true, kingCounty: inKing, positions: [position({ workedMinutes: 120, rates: rates({ stateCents: 6000 }) })] }), settings());
    assert.equal(l.positions[0].bill[0].rateCents, 6000);
    assert.match(l.positions[0].warnings[0], /No King County rate/);
  });

  it("uses the standard State rate outside King County", () => {
    const l = jobLedger(job({ inPerson: true, positions: [position({ workedMinutes: 120, rates: rates({ stateCents: 6000, kingCountyCents: 7000 }) })] }), settings());
    assert.equal(l.positions[0].bill[0].rateCents, 6000);
  });

  it("never applies to Non-state jobs (the client's rate is billed)", () => {
    const l = jobLedger(job({ category: "non_state", inPerson: true, kingCounty: inKing, positions: [position({ workedMinutes: 120, rates: rates({ nonStateCents: 6800, kingCountyCents: 7000 }) })] }), settings());
    assert.equal(l.positions[0].bill[0].rateCents, 9500);
    assert.equal(l.positions[0].pay[0].rateCents, 6800);
  });
});
