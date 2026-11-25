import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { amountText, cycleProgress, defaultCycleId, emptyEntryForm, formatAmount, isActiveCycle, meterMet, meterPercent, orderCycles, renewalCountdown } from "@/lib/ceu";
import type { CycleView, EntryView } from "@/lib/ceu";
import { ceuCsvText } from "@/lib/ceuCsv";
import { ALL_CYCLES, NO_CYCLE, applyCeuFilters, ceuExportQuery, parseCeuExportQuery } from "@/lib/ceuFilters";
import type { CeuFilters } from "@/lib/ceuFilters";
import { cycleChangeBlocked, entryOutsideCycle } from "@/lib/ceuRules";
import { isRealDay, parseAmount, parseCycle, parseEntry } from "@/lib/validation/ceu";

/** The CEUs & renewals logic: validation, the cycle/entry rules, progress sums, the countdown badges, filters and the CSV. All pure. */

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const cycle = (over: Partial<CycleView> = {}): CycleView => ({
  id: C1, credentialId: null, label: "Certification cycle", cycleStart: "2023-01-01", cycleEnd: "2026-12-31", unit: "ceu",
  requiredTotal: 8, requiredEthics: 1, requiredPpo: 1, ...over,
});
const entry = (i: number, over: Partial<EntryView> = {}): EntryView => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, cycleId: C1, earnedOn: "2025-03-10", title: `Workshop ${i}`, provider: "Sample Provider",
  category: "Workshop or conference", amount: 0.1, unit: "ceu", isEthics: false, isPpo: false, createdAt: `2025-03-10T00:00:0${i % 10}.000Z`, ...over,
});
const NOW = new Date("2026-11-26T20:00:00Z");

describe("amounts and days", () => {
  it("accepts up to two decimals, above 0 and at most 999.99", () => {
    assert.equal(parseAmount("0.3"), 0.3);
    assert.equal(parseAmount(" 1 "), 1);
    assert.equal(parseAmount(".5"), 0.5);
    assert.equal(parseAmount(2), 2);
    assert.equal(parseAmount("999.99"), 999.99);
    for (const bad of ["0", "0.00", "-1", "1.234", "abc", "", "1e3", "1000", "1,5", null, undefined]) assert.equal(parseAmount(bad), null, String(bad));
  });
  it("tells a real calendar day from an impossible one", () => {
    assert.ok(isRealDay("2026-02-28") && isRealDay("2024-02-29"));
    assert.ok(!isRealDay("2026-02-30") && !isRealDay("2026-13-01") && !isRealDay("26-01-01") && !isRealDay(""));
  });
  it("formats amounts plainly", () => {
    assert.equal(formatAmount(6.5), "6.5");
    assert.equal(formatAmount(8), "8");
    assert.equal(formatAmount(0.3), "0.3");
    assert.equal(amountText(1, "ceu"), "1 CEU");
    assert.equal(amountText(0.3, "ceu"), "0.3 CEUs");
    assert.equal(amountText(1, "hours"), "1 hour");
    assert.equal(amountText(12.5, "hours"), "12.5 hours");
  });
});

describe("parseCycle", () => {
  const ok = { label: "State court renewal", cycleStart: "2024-01-01", cycleEnd: "2026-12-31", unit: "hours", requiredTotal: "20", requiredEthics: "2", requiredPpo: "" };
  it("accepts a cycle with no credential and no targets, and a cycle with all three targets", () => {
    const bare = parseCycle({ label: "My cycle", cycleStart: "2024-01-01", cycleEnd: "2025-01-01" });
    assert.ok(bare.ok);
    if (bare.ok) assert.deepEqual(bare.data, { label: "My cycle", credentialId: null, cycleStart: "2024-01-01", cycleEnd: "2025-01-01", unit: "ceu", requiredTotal: null, requiredEthics: null, requiredPpo: null });
    const full = parseCycle({ ...ok, credentialId: C2, requiredPpo: "1" });
    assert.ok(full.ok);
    if (full.ok) assert.deepEqual([full.data.credentialId, full.data.unit, full.data.requiredTotal, full.data.requiredEthics, full.data.requiredPpo], [C2, "hours", 20, 2, 1]);
  });
  it("names each problem on its own field", () => {
    const r = parseCycle({ label: " ", cycleStart: "nope", cycleEnd: "2026-02-30", unit: "days", credentialId: "x", requiredTotal: "abc" });
    assert.ok(!r.ok);
    if (!r.ok) for (const f of ["label", "cycleStart", "cycleEnd", "unit", "credentialId"] as const) assert.ok(r.fieldErrors[f], f);
  });
  it("needs the end after the start and at most ten years", () => {
    const same = parseCycle({ ...ok, cycleEnd: "2024-01-01" });
    assert.ok(!same.ok && same.fieldErrors.cycleEnd);
    const back = parseCycle({ ...ok, cycleEnd: "2023-01-01" });
    assert.ok(!back.ok && back.fieldErrors.cycleEnd);
    const long = parseCycle({ ...ok, cycleEnd: "2040-01-01" });
    assert.ok(!long.ok && /ten years/.test(long.fieldErrors.cycleEnd ?? ""));
  });
  it("refuses a bad target and a sub-target above the total", () => {
    const bad = parseCycle({ ...ok, requiredPpo: "0" });
    assert.ok(!bad.ok && bad.fieldErrors.requiredPpo);
    const over = parseCycle({ ...ok, requiredEthics: "25" });
    assert.ok(!over.ok && /more than the total/.test(over.fieldErrors.requiredEthics ?? ""));
  });
});

describe("parseEntry", () => {
  const ok = { title: "Medical terminology", provider: "", category: "Webinar", earnedOn: "2026-03-01", amount: "0.3", unit: "ceu", cycleId: "", isEthics: true };
  it("accepts an entry with no cycle, with the flags as sent", () => {
    const r = parseEntry(ok, NOW);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.data, { title: "Medical terminology", provider: null, category: "Webinar", earnedOn: "2026-03-01", amount: 0.3, unit: "ceu", cycleId: null, isEthics: true, isPpo: false });
  });
  it("accepts today and tomorrow (for a zone ahead of UTC) but not a later date, and not before 1990", () => {
    assert.ok(parseEntry({ ...ok, earnedOn: "2026-11-27" }, NOW).ok);
    const later = parseEntry({ ...ok, earnedOn: "2026-11-29" }, NOW);
    assert.ok(!later.ok && later.fieldErrors.earnedOn);
    const old = parseEntry({ ...ok, earnedOn: "1980-01-01" }, NOW);
    assert.ok(!old.ok && old.fieldErrors.earnedOn);
  });
  it("needs a title, a category from the list, a unit, a cycle id that is an id, and an amount", () => {
    const r = parseEntry({ ...ok, title: "", category: "Poetry", unit: "days", cycleId: "x", amount: "0" }, NOW);
    assert.ok(!r.ok);
    if (!r.ok) for (const f of ["title", "category", "unit", "cycleId", "amount"] as const) assert.ok(r.fieldErrors[f], f);
  });
});

describe("the rules that join an entry to its cycle", () => {
  it("an entry must fall inside the cycle's dates", () => {
    assert.equal(entryOutsideCycle("2025-01-01", cycle()), null);
    assert.equal(entryOutsideCycle("2023-01-01", cycle()), null);
    assert.equal(entryOutsideCycle("2026-12-31", cycle()), null);
    assert.match(entryOutsideCycle("2022-12-31", cycle()) ?? "", /outside this cycle \(Jan 1, 2023 to Dec 31, 2026\)/);
    assert.ok(entryOutsideCycle("2027-01-01", cycle()));
  });
  it("a cycle's unit and dates cannot change in a way that strands an assigned entry", () => {
    const next = { cycleStart: "2023-01-01", cycleEnd: "2026-12-31", unit: "ceu" as const };
    assert.equal(cycleChangeBlocked(next, []), null);
    assert.equal(cycleChangeBlocked({ ...next, unit: "hours" }, []), null, "an empty cycle may change its unit");
    assert.equal(cycleChangeBlocked(next, [{ earnedOn: "2025-01-01", unit: "ceu" }]), null);
    assert.match(cycleChangeBlocked({ ...next, unit: "hours" }, [{ earnedOn: "2025-01-01", unit: "ceu" }]) ?? "", /logged in ceus/);
    assert.match(cycleChangeBlocked({ ...next, cycleStart: "2025-06-01" }, [{ earnedOn: "2025-01-01", unit: "ceu" }]) ?? "", /1 logged entry falls outside/);
    assert.match(cycleChangeBlocked({ ...next, cycleEnd: "2023-06-01" }, [{ earnedOn: "2025-01-01", unit: "ceu" }, { earnedOn: "2025-02-01", unit: "ceu" }]) ?? "", /2 logged entries fall outside/);
  });
});

describe("progress", () => {
  it("sums in hundredths, counts an entry once toward the total and each flag it carries, and ignores other cycles", () => {
    const entries = [
      entry(1, { amount: 0.1 }), entry(2, { amount: 0.2, isEthics: true }), entry(3, { amount: 1, isEthics: true, isPpo: true }),
      entry(4, { amount: 5, cycleId: C2 }), entry(5, { amount: 2, cycleId: null }),
    ];
    const p = cycleProgress(cycle(), entries);
    assert.deepEqual([p.total.earned, p.ethics.earned, p.ppo.earned, p.count], [1.3, 1.2, 1, 3]);
    assert.deepEqual([p.total.target, p.ethics.target, p.ppo.target], [8, 1, 1]);
    assert.equal(cycleProgress(cycle(), [entry(1, { amount: 0.1 }), entry(2, { amount: 0.2 })]).total.earned, 0.3, "0.1 + 0.2 is 0.3");
  });
  it("percent is null for a target that is not tracked, capped at 100, and met at or above the target", () => {
    assert.equal(meterPercent({ earned: 1, target: null }), null);
    assert.equal(meterPercent({ earned: 4, target: 8 }), 50);
    assert.equal(meterPercent({ earned: 9, target: 8 }), 100);
    assert.equal(meterPercent({ earned: 0, target: 8 }), 0);
    assert.ok(meterMet({ earned: 8, target: 8 }) && meterMet({ earned: 9, target: 8 }));
    assert.ok(!meterMet({ earned: 7.99, target: 8 }) && !meterMet({ earned: 5, target: null }));
  });
});

describe("the countdown badge, in the interpreter's own time zone", () => {
  const at = (end: string, zone = "America/Los_Angeles") => renewalCountdown(end, zone, NOW);
  it("badges at 180, 90, 60 and 30 days, and nothing further out", () => {
    assert.equal(at("2027-05-26"), null, "181 days");
    assert.deepEqual([at("2027-05-25")?.tier, at("2027-05-25")?.days], ["180", 180]);
    assert.equal(at("2027-05-24")?.label, "Ends in 179 days");
    assert.equal(at("2027-02-23")?.tier, "90");
    assert.equal(at("2027-01-25")?.tier, "60");
    assert.equal(at("2026-12-26")?.tier, "30");
    assert.equal(at("2026-12-27")?.tier, "60");
  });
  it("is still open on its end date and ended the day after", () => {
    assert.equal(at("2026-11-26")?.label, "Ends today");
    assert.equal(at("2026-11-27")?.label, "Ends tomorrow");
    assert.deepEqual([at("2026-11-25")?.tier, at("2026-11-25")?.label], ["ended", "Ended"]);
  });
  it("uses the interpreter's date, not UTC's: 8pm UTC is already tomorrow in Tokyo", () => {
    assert.equal(at("2026-11-27", "Asia/Tokyo")?.label, "Ends today");
    assert.equal(at("2026-11-27", "America/Los_Angeles")?.label, "Ends tomorrow");
  });
  it("the cycle list puts open cycles first (soonest end on top), then ended ones newest first", () => {
    const list = [cycle({ id: "a", cycleEnd: "2025-01-01" }), cycle({ id: "b", cycleEnd: "2028-01-01" }), cycle({ id: "c", cycleEnd: "2027-01-01" }), cycle({ id: "d", cycleEnd: "2025-06-01" })];
    assert.deepEqual(orderCycles(list, "2026-11-26").map((c) => c.id), ["c", "b", "d", "a"]);
    assert.ok(isActiveCycle({ cycleEnd: "2026-11-26" }, "2026-11-26") && !isActiveCycle({ cycleEnd: "2026-11-25" }, "2026-11-26"));
  });
});

describe("the cycle a new entry starts in", () => {
  it("is the only open cycle, and none when there are none or several", () => {
    const open = cycle({ id: C1 });
    const ended = cycle({ id: C2, cycleEnd: "2024-12-31" });
    assert.equal(defaultCycleId([open, ended], "2026-11-26"), C1);
    assert.equal(defaultCycleId([ended], "2026-11-26"), "");
    assert.equal(defaultCycleId([open, cycle({ id: C2 })], "2026-11-26"), "");
    assert.equal(defaultCycleId([], "2026-11-26"), "");
    const form = emptyEntryForm([open, ended], "2026-11-26");
    assert.deepEqual([form.cycleId, form.unit, form.earnedOn], [C1, "ceu", "2026-11-26"]);
    assert.equal(emptyEntryForm([cycle({ unit: "hours" })], "2026-11-26").unit, "hours", "takes the cycle's unit");
    assert.deepEqual([emptyEntryForm([], "2026-11-26").cycleId, emptyEntryForm([], "2026-11-26").unit], ["", "ceu"]);
  });
});

describe("filters", () => {
  const all = [
    entry(1, { title: "Ethics in practice", isEthics: true, earnedOn: "2025-01-05", amount: 0.2 }),
    entry(2, { title: "Medical terms", provider: "Acme Training", earnedOn: "2025-06-05", amount: 0.5, cycleId: null }),
    entry(3, { title: "Equity workshop", isPpo: true, earnedOn: "2025-09-05", amount: 0.3 }),
  ];
  const f = (patch: Partial<CeuFilters>): CeuFilters => ({ query: "", cycle: ALL_CYCLES, focus: "all", sort: "newest", ...patch });
  const titles = (patch: Partial<CeuFilters>) => applyCeuFilters(all, f(patch)).map((e) => e.title);
  it("searches title, provider and category, every word, ignoring case", () => {
    assert.deepEqual(titles({ query: "acme" }), ["Medical terms"]);
    assert.deepEqual(titles({ query: "WORKSHOP equity" }), ["Equity workshop"]);
    assert.equal(titles({ query: "zzz" }).length, 0);
  });
  it("filters by cycle, no cycle, and ethics or PPO focus", () => {
    assert.deepEqual(titles({ cycle: NO_CYCLE }), ["Medical terms"]);
    assert.deepEqual(titles({ cycle: C1 }), ["Equity workshop", "Ethics in practice"]);
    assert.deepEqual(titles({ focus: "ethics" }), ["Ethics in practice"]);
    assert.deepEqual(titles({ focus: "ppo" }), ["Equity workshop"]);
  });
  it("sorts newest, oldest and largest first", () => {
    assert.deepEqual(titles({}), ["Equity workshop", "Medical terms", "Ethics in practice"]);
    assert.deepEqual(titles({ sort: "oldest" }), ["Ethics in practice", "Medical terms", "Equity workshop"]);
    assert.deepEqual(titles({ sort: "largest" }), ["Medical terms", "Equity workshop", "Ethics in practice"]);
  });
  it("the export link carries the view, and the route reads back only what it understands", () => {
    assert.equal(ceuExportQuery(f({})), "");
    assert.equal(ceuExportQuery(f({ query: " acme ", cycle: C1, focus: "ppo" })), `q=acme&cycle=${C1}&focus=ppo`);
    const read = parseCeuExportQuery(new URLSearchParams({ q: "x".repeat(300), cycle: "'; drop table", focus: "weird" }));
    assert.deepEqual([read.query.length, read.cycle, read.focus], [100, "", "all"]);
    assert.equal(parseCeuExportQuery(new URLSearchParams({ cycle: "none" })).cycle, "none");
  });
});

describe("the CSV transcript", () => {
  it("has the header, the cycle's name, plain amounts and a byte-order mark", () => {
    const text = ceuCsvText([entry(1, { amount: 0.3, isEthics: true })], [cycle()]);
    assert.ok(text.startsWith("﻿"));
    const lines = text.slice(1).split("\r\n");
    assert.equal(lines[0], "Date earned,Title,Provider,Category,Amount,Unit,Ethics,PPO,Cycle");
    assert.equal(lines[1], "2025-03-10,Workshop 1,Sample Provider,Workshop or conference,0.3,CEUs,Yes,,Certification cycle");
  });
  it("writes a cell a spreadsheet would run as a formula with a leading quote, in every text column", () => {
    const text = ceuCsvText([entry(1, { title: "=HYPERLINK(\"http://x\")", provider: "+1-555", category: "@SUM(A1)" })], [cycle({ label: "-cmd" })]);
    const row = text.slice(1).split("\r\n")[1];
    assert.ok(row.includes("'=HYPERLINK"), row);
    assert.ok(row.includes("'+1-555") && row.includes("'@SUM(A1)") && row.includes("'-cmd"), row);
    assert.ok(!/(^|,)"?[=+@-]/.test(row.replace(/^2025-03-10,/, "")), "no cell starts with a formula character");
  });
  it("an entry with no cycle has an empty cycle column", () => {
    assert.ok(ceuCsvText([entry(1, { cycleId: null })], [cycle()]).trimEnd().endsWith(",,"));
  });
});
