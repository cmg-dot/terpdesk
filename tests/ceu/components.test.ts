import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CeuView, CycleView, EntryView } from "@/lib/ceu";
import type { MyCredential } from "@/lib/validation/credential";

(globalThis as { React?: typeof React }).React = React;

const EM_DASH = String.fromCharCode(0x2014);
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
const C1 = "11111111-1111-4111-8111-111111111111";
const cycle: CycleView = { id: C1, credentialId: null, label: "Certification cycle", cycleStart: "2023-01-01", cycleEnd: "2099-12-31", unit: "ceu", requiredTotal: 8, requiredEthics: 1, requiredPpo: null };
const entry = (i: number, over: Partial<EntryView> = {}): EntryView => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, cycleId: C1, earnedOn: "2025-03-10", title: `Workshop ${i}`, provider: "Acme", category: "Webinar",
  amount: 0.5, unit: "ceu", isEthics: false, isPpo: false, createdAt: `2025-03-10T00:00:${String(i % 60).padStart(2, "0")}.000Z`, ...over,
});

const tab = async (view: CeuView | null, status: "ok" | "not_ready" | "not_linked" | "error" = "ok") => {
  const { CeuTab } = await import("@/components/profile/ceu/CeuTab");
  const data = view === null ? null : status === "ok" ? { status: "ok" as const, ...view } : { status };
  return renderToStaticMarkup(React.createElement(CeuTab, { data, onData: () => undefined, credentials: [] as MyCredential[], timeZone: "America/Los_Angeles" }));
};

describe("the CEUs & renewals tab", () => {
  it("opens with the private lock banner, not the agency-visible one", async () => {
    const html = await tab({ cycles: [], entries: [] });
    assert.ok(html.includes("data-ceu-private") && html.includes("Private to you. Agencies never see this."));
    assert.ok(!html.includes("Visible to your agency"));
  });
  it("loading, not set up, not linked and error each say so (and only error offers Try again)", async () => {
    assert.ok((await tab(null)).includes("Loading your renewals"));
    const missing = await tab({ cycles: [], entries: [] }, "not_ready");
    assert.ok(missing.includes("not set up on this database yet") && !missing.includes("Try again") && !missing.includes("data-ceu-cycles"));
    assert.ok((await tab({ cycles: [], entries: [] }, "not_linked")).includes("Connect your interpreter profile"));
    assert.ok((await tab({ cycles: [], entries: [] }, "error")).includes("Try again"));
  });
  it("with nothing yet: explains cycles work standalone, offers New cycle and Log a training, and has no toolbar or export", async () => {
    const html = await tab({ cycles: [], entries: [] });
    assert.ok(html.includes('data-ceu-empty="cycles"') && html.includes('data-ceu-empty="entries"'));
    assert.ok(html.includes("track a cycle on its own") && html.includes("New cycle") && html.includes("Log a training"));
    assert.ok(!html.includes("data-ceu-toolbar") && !html.includes("/api/profile/ceu/export"));
  });
  it("a cycle shows its dates, unit, progress bars for set targets only, and what is logged", async () => {
    const html = await tab({ cycles: [cycle], entries: [entry(1, { amount: 1, isEthics: true }), entry(2, { amount: 0.5 })] });
    assert.ok(html.includes(`data-ceu-cycle="${C1}"`) && html.includes("Certification cycle") && html.includes("CEUs"));
    assert.ok(html.includes('data-ceu-meter="Total"') && html.includes('data-ceu-meter="Ethics"'));
    assert.ok(!html.includes('data-ceu-meter="PPO"'), "a target that is not set has no bar");
    assert.ok(html.includes("1.5 of 8 CEUs") && html.includes("1 of 1 CEU") && html.includes(">Met<"));
    assert.ok(html.includes('role="progressbar"') && html.includes("Logged: 1.5 CEUs in 2 entries."));
  });
  it("a cycle with no targets says so and still totals what is logged", async () => {
    const html = await tab({ cycles: [{ ...cycle, requiredTotal: null, requiredEthics: null }], entries: [entry(1)] });
    assert.ok(!html.includes("data-ceu-meter") && html.includes("No targets set. Logged: 0.5 CEUs in 1 entry."));
  });
  it("the log: ten cards a page, the pager, the toolbar with search and its filters, and an export link carrying the view", async () => {
    const entries = Array.from({ length: 25 }, (_, i) => entry(i + 1));
    const html = await tab({ cycles: [cycle], entries });
    assert.equal((html.match(/data-ceu-entry="/g) ?? []).length, 10);
    assert.ok(html.includes("Showing 25 of 25") && html.includes("Showing 1-10 of 25") && html.includes("Page 1 of 3"));
    assert.ok(html.includes('aria-label="Search CEU log"') && html.includes('aria-label="Cycle"') && html.includes('aria-label="Focus"') && html.includes('aria-label="Sort by"'));
    assert.ok(html.includes('href="/api/profile/ceu/export"') && html.includes("Export CSV, 25 entries shown"));
    assert.ok(html.includes("All cycles") && html.includes("All entries") && html.includes("Newest first"));
  });
  it("an entry card shows amount, date, category, its cycle (or No cycle) and the Ethics and PPO chips", async () => {
    const html = await tab({ cycles: [cycle], entries: [entry(1, { isEthics: true, isPpo: true }), entry(2, { cycleId: null })] });
    assert.ok(html.includes("Certification cycle") && html.includes("No cycle") && html.includes(">Ethics<") && html.includes(">PPO<") && html.includes("0.5 CEUs"));
    assert.ok(html.includes("Edit") && html.includes("Delete"));
  });
});

describe("how the tab is built", () => {
  it("is the fourth pill on /profile, loaded only when opened, and Visibility & sharing says what is never shared", () => {
    const tabs = read("src", "components", "profile", "ProfileTabs.tsx");
    assert.ok(/id: "overview"[\s\S]*id: "credentials"[\s\S]*id: "ceus", label: "CEUs & renewals"[\s\S]*id: "visibility"/.test(tabs), "order: Overview, Credentials, CEUs & renewals, Visibility & sharing");
    assert.ok(tabs.includes('tab === "ceus"') && !tabs.includes("loadMyCeu"), "the page does not load CEU data up front");
    assert.ok(read("src", "components", "profile", "VisibilitySharingTab.tsx").includes("Never shared:"));
    assert.ok(read("src", "components", "profile", "CredentialsTab.tsx").includes("Visible to your agency."), "the Credentials banner is unchanged");
  });
  it("uses the theme tokens, honours reduced motion, and has no any, no em-dash and no file over 300 lines", () => {
    const files = [
      ...readdirSync(join(process.cwd(), "src", "components", "profile", "ceu")).map((f) => ["src", "components", "profile", "ceu", f]),
      ["src", "lib", "ceu.ts"], ["src", "lib", "ceuRules.ts"], ["src", "lib", "ceuFilters.ts"], ["src", "lib", "ceuCsv.ts"], ["src", "lib", "ceuStore.ts"], ["src", "lib", "ceuData.ts"],
      ["src", "lib", "validation", "ceu.ts"], ["src", "app", "actions", "ceu.ts"], ["src", "app", "api", "profile", "ceu", "export", "route.ts"], ["src", "db", "ceuSchema.ts"],
    ];
    let all = "";
    for (const parts of files) {
      const source = read(...parts);
      all += source;
      assert.ok(source.split("\n").length <= 300, `${parts.join("/")} is over 300 lines`);
      assert.ok(!source.includes(EM_DASH), `${parts.join("/")} has an em-dash`);
      assert.ok(!/:\s*any\b|\bas any\b|<any>/.test(source), `${parts.join("/")} has an any`);
    }
    for (const token of ["--forest", "--tint", "--surface", "--pill", "--accent"]) assert.ok(all.includes(`var(${token}`), `uses ${token}`);
    assert.ok(all.includes("useHoursMotion") && all.includes("useSlashToFocus"));
  });
});
