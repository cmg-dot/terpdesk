import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GLOSSARY_CSV_HEADER, emptyGlossaryForm, glossaryCsvRows, pairLabel } from "@/lib/glossary";
import type { GlossaryTermView } from "@/lib/glossary";
import { ALL_PAIRS, DEFAULT_GLOSSARY_FILTERS, applyGlossaryFilters, glossaryExportQuery, glossaryPairOptions, glossarySettingOptions, hasActiveGlossaryFilters, matchesGlossaryQuery, parseGlossaryExportQuery } from "@/lib/glossaryFilters";
import { MAX_IMPORT_ROWS, parseGlossaryCsv } from "@/lib/glossaryImport";
import { parseGlossaryTerm } from "@/lib/validation/glossaryTerm";
import { ALL_SETTINGS } from "@/lib/websiteRequestView";

const term = (over: Partial<GlossaryTermView> = {}): GlossaryTermView => ({
  id: "a", term: "discharge summary", rendering: "DISCHARGE-PAPERS", sourceLang: "English", targetLang: "ASL", setting: "Medical", note: "", createdAt: "2026-11-01T00:00:00.000Z", ...over,
});
const sample: GlossaryTermView[] = [
  term({ id: "1", term: "Subpoena", rendering: "COURT-PAPER-SERVE", setting: "Legal", createdAt: "2026-11-03T00:00:00.000Z", note: "served in person" }),
  term({ id: "2", term: "discharge summary", createdAt: "2026-11-02T00:00:00.000Z" }),
  term({ id: "3", term: "IEP meeting", rendering: "reunion del IEP", targetLang: "Spanish", setting: "Education", createdAt: "2026-11-01T00:00:00.000Z" }),
  term({ id: "4", term: "Blood draw", rendering: "BLOOD-TAKE", setting: "", createdAt: "2026-10-01T00:00:00.000Z" }),
];

describe("parseGlossaryTerm", () => {
  it("takes a term and its rendering, defaults the pair to English and ASL, and stores empty optional fields as not stated", () => {
    const result = parseGlossaryTerm({ term: "  triage  ", rendering: " TRIAGE-SORT ", setting: "", note: "" });
    assert.ok(result.ok);
    assert.deepEqual(result.data, { term: "triage", rendering: "TRIAGE-SORT", sourceLang: "English", targetLang: "ASL", setting: null, note: null });
  });

  it("needs both words, keeps them inside their limits, and refuses a language or setting that is not in the lists", () => {
    const bad = parseGlossaryTerm({ term: " ", rendering: "x".repeat(301), sourceLang: "Klingon", setting: "Poetry", note: "n".repeat(301) });
    assert.ok(!bad.ok);
    assert.deepEqual(Object.keys(bad.fieldErrors).sort(), ["note", "rendering", "setting", "sourceLang", "term"]);
  });

  it("refuses a pair that is one language twice, except Other", () => {
    const same = parseGlossaryTerm({ term: "a", rendering: "b", sourceLang: "Spanish", targetLang: "Spanish" });
    assert.ok(!same.ok && same.fieldErrors.targetLang);
    assert.ok(parseGlossaryTerm({ term: "a", rendering: "b", sourceLang: "Other", targetLang: "Other" }).ok);
  });

  it("accepts a spoken-language pair and a setting from the system's list", () => {
    const ok = parseGlossaryTerm({ term: "hearing", rendering: "audiencia", sourceLang: "English", targetLang: "Spanish", setting: "Legal", note: "court" });
    assert.ok(ok.ok && ok.data.setting === "Legal" && ok.data.targetLang === "Spanish");
  });
});

describe("the glossary filters", () => {
  it("search needs every word, in the term, rendering, note or setting, in any case", () => {
    assert.ok(matchesGlossaryQuery(sample[0], "SUBPOENA served"));
    assert.ok(matchesGlossaryQuery(sample[0], "court-paper"));
    assert.ok(matchesGlossaryQuery(sample[0], "legal"));
    assert.ok(!matchesGlossaryQuery(sample[0], "subpoena hospital"));
    assert.ok(matchesGlossaryQuery(sample[0], "   "));
  });

  it("narrows by language pair and setting, case-insensitively, and by both together", () => {
    assert.deepEqual(applyGlossaryFilters(sample, { ...DEFAULT_GLOSSARY_FILTERS, pair: "English to Spanish" }).map((t) => t.id), ["3"]);
    assert.deepEqual(applyGlossaryFilters(sample, { ...DEFAULT_GLOSSARY_FILTERS, setting: "medical" }).map((t) => t.id), ["2"]);
    assert.deepEqual(applyGlossaryFilters(sample, { ...DEFAULT_GLOSSARY_FILTERS, pair: "English to ASL", setting: "Legal" }).map((t) => t.id), ["1"]);
  });

  it("sorts newest first, A to Z, or by setting with unset settings last", () => {
    assert.deepEqual(applyGlossaryFilters(sample, DEFAULT_GLOSSARY_FILTERS).map((t) => t.id), ["1", "2", "3", "4"]);
    assert.deepEqual(applyGlossaryFilters(sample, { ...DEFAULT_GLOSSARY_FILTERS, sort: "az" }).map((t) => t.term), ["Blood draw", "discharge summary", "IEP meeting", "Subpoena"]);
    assert.deepEqual(applyGlossaryFilters(sample, { ...DEFAULT_GLOSSARY_FILTERS, sort: "setting" }).map((t) => t.id), ["3", "1", "2", "4"]);
  });

  it("offers the pairs the glossary has (most used first) and the system settings plus any other one a term carries", () => {
    assert.deepEqual(glossaryPairOptions(sample), [ALL_PAIRS, "English to ASL", "English to Spanish"]);
    const settings = glossarySettingOptions([...sample, term({ id: "5", setting: "Church" })]);
    assert.equal(settings[0], ALL_SETTINGS);
    assert.ok(settings.includes("Medical") && settings.at(-1) === "Church");
  });

  it("knows when something narrows the view, and round-trips the export query", () => {
    assert.ok(!hasActiveGlossaryFilters(DEFAULT_GLOSSARY_FILTERS) && hasActiveGlossaryFilters({ ...DEFAULT_GLOSSARY_FILTERS, query: "x" }));
    const filters = { query: "subpoena", pair: "English to ASL", setting: "Legal", sort: "newest" as const };
    assert.equal(glossaryExportQuery(DEFAULT_GLOSSARY_FILTERS), "");
    assert.deepEqual(parseGlossaryExportQuery(new URLSearchParams(glossaryExportQuery(filters))), filters);
    assert.deepEqual(parseGlossaryExportQuery(new URLSearchParams("sort=az&junk=1")), DEFAULT_GLOSSARY_FILTERS);
  });
});

describe("display and CSV helpers", () => {
  it("names a pair, starts a form in the last pair and setting, and writes the export's columns", () => {
    assert.equal(pairLabel(sample[2]), "English to Spanish");
    assert.deepEqual(emptyGlossaryForm("English", "Spanish", "Legal"), { term: "", rendering: "", sourceLang: "English", targetLang: "Spanish", setting: "Legal", note: "" });
    assert.deepEqual(emptyGlossaryForm(), { term: "", rendering: "", sourceLang: "English", targetLang: "ASL", setting: "", note: "" });
    assert.deepEqual([...GLOSSARY_CSV_HEADER], ["Source term", "Target rendering", "Source language", "Target language", "Setting", "Context note"]);
    assert.deepEqual(glossaryCsvRows([sample[0]]), [["Subpoena", "COURT-PAPER-SERVE", "English", "ASL", "Legal", "served in person"]]);
  });
});

describe("parseGlossaryCsv", () => {
  const header = "Source term,Target rendering,Source language,Target language,Setting,Context note";

  it("reads the export's own columns (with a byte order mark), and the short names term and rendering", () => {
    const full = parseGlossaryCsv(`﻿${header}\r\nSubpoena,COURT-PAPER,English,ASL,Legal,served\r\nHearing,audiencia,English,Spanish,Legal,\r\n`);
    assert.equal(full.problem, null);
    assert.deepEqual(full.rows.map((r) => [r.term, r.targetLang, r.setting, r.note]), [["Subpoena", "ASL", "Legal", "served"], ["Hearing", "Spanish", "Legal", null]]);
    const short = parseGlossaryCsv("term,rendering\ntriage,TRIAGE-SORT\n");
    assert.deepEqual(short.rows.map((r) => [r.term, r.sourceLang, r.targetLang]), [["triage", "English", "ASL"]]);
  });

  it("skips rows the form would refuse and rows repeated in the file, and counts them", () => {
    const read = parseGlossaryCsv(`${header}\nA,a,English,ASL,Legal,\nA,A,English,ASL,Legal,\n,missing term,English,ASL,,\nB,b,Klingon,ASL,,\nC,c,English,ASL,Poetry,\nD,d,English,English,,\n`);
    assert.deepEqual(read.rows.map((r) => r.term), ["A"]);
    assert.equal(read.invalid, 5);
  });

  it("refuses a file with no recognisable columns, an empty file, a huge one, and one with too many rows", () => {
    assert.ok(parseGlossaryCsv("name,value\nx,y\n").problem?.includes("name the columns"));
    assert.ok(parseGlossaryCsv("   ").problem);
    assert.ok(parseGlossaryCsv("x".repeat(400_001)).problem?.includes("too large"));
    const many = `term,rendering\n${Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `t${i},r${i}`).join("\n")}\n`;
    assert.ok(parseGlossaryCsv(many).problem?.includes("more than"));
  });

  it("keeps a formula-looking cell as text (the export escapes it, the page never evaluates it)", () => {
    const read = parseGlossaryCsv("term,rendering\n=SUM(A1),@x\n");
    assert.deepEqual(read.rows.map((r) => [r.term, r.rendering]), [["=SUM(A1)", "@x"]]);
  });
});
