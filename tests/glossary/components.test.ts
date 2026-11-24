import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GlossaryTermView } from "@/lib/glossary";

(globalThis as { React?: typeof React }).React = React;

const EM_DASH = String.fromCharCode(0x2014);
const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

const term = (i: number, over: Partial<GlossaryTermView> = {}): GlossaryTermView => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, term: `Term ${i}`, rendering: `RENDER-${i}`, sourceLang: "English", targetLang: "ASL", setting: "Medical", note: "", createdAt: new Date(Date.UTC(2026, 10, 1) - i * 86_400_000).toISOString(), ...over,
});
const terms = (n: number): GlossaryTermView[] => Array.from({ length: n }, (_, i) => term(i + 1));

describe("the Glossary tab", () => {
  const board = async (initialTerms: GlossaryTermView[]) => {
    const { GlossaryBoard } = await import("@/components/glossary/GlossaryBoard");
    return renderToStaticMarkup(React.createElement(GlossaryBoard, { initialTerms }));
  };

  it("with no terms: says what it is for, offers Add and Import, and has no export button or filters", async () => {
    const html = await board([]);
    assert.ok(html.includes('data-glossary-empty="none"') && html.includes("Your glossary is empty"));
    assert.ok(html.includes("Add a term") && html.includes("Import CSV"));
    assert.ok(!html.includes("/api/glossary/export") && !html.includes("data-glossary-toolbar"));
    assert.ok(html.includes("without any agency"), "tells a standalone interpreter it works with no agency");
  });

  it("with terms: the toolbar, ten cards a page, the pager, and an export link that carries the view", async () => {
    const html = await board(terms(25));
    assert.equal((html.match(/data-glossary-term="/g) ?? []).length, 10);
    assert.ok(html.includes("Showing 25 of 25") && html.includes("Showing 1-10 of 25") && html.includes("Page 1 of 3"));
    assert.ok(html.includes('aria-label="Search glossary"') && html.includes('aria-label="Language pair"') && html.includes('aria-label="Setting"') && html.includes('aria-label="Sort by"'));
    assert.ok(html.includes('href="/api/glossary/export"') && html.includes("Export CSV, 25 terms shown"));
    assert.ok(html.includes("All language pairs") && html.includes("All settings") && html.includes("Newest first"));
  });

  it("uses the workspace theme's colours and has no em-dash", async () => {
    const html = await board(terms(2));
    for (const token of ["--forest", "--tint", "--banner-edge", "--sage", "--ink"]) assert.ok(html.includes(`var(${token}`), token);
    assert.ok(!html.includes(EM_DASH) && !html.includes("indigo"));
  });
});

describe("a glossary card", () => {
  const card = async (editing: boolean, t: GlossaryTermView) => {
    const { GlossaryCard } = await import("@/components/glossary/GlossaryCard");
    return renderToStaticMarkup(React.createElement(GlossaryCard, { term: t, editing, onEdit: () => undefined, onSaved: () => undefined, onCancelEdit: () => undefined, onDelete: async () => null }));
  };
  const sample = term(1, { term: "discharge summary", rendering: "DISCHARGE-PAPERS", note: "read the whole page", setting: "Medical" });

  it("shows the term as the title, the rendering, the pair and setting pills, the note, and Edit and Delete", async () => {
    const html = await card(false, sample);
    assert.match(html, /<h3[^>]*>discharge summary<\/h3>/);
    for (const text of ["DISCHARGE-PAPERS", "English to ASL", "Medical", "read the whole page", ">Edit<", ">Delete<"]) assert.ok(html.includes(text), text);
    assert.ok(!html.includes("data-glossary-form") && html.includes('data-editing="false"'));
  });

  it("opens the form inside the card, filled in, with Save changes and Cancel, ids of its own, and no Edit or Delete", async () => {
    const html = await card(true, sample);
    assert.ok(html.includes('data-editing="true"') && html.includes("data-glossary-form") && html.includes("Save changes") && html.includes(">Cancel<"));
    assert.ok(html.includes(`id="gl-edit-${sample.id}-term"`) && html.includes('value="discharge summary"') && !html.includes('id="gl-term"'));
    assert.ok(!html.includes(">Edit<") && !html.includes(">Delete<"));
  });
});

describe("the glossary form", () => {
  it("labels the two sides for ASL and spoken languages, has the pair, setting and note, and the privacy hint", async () => {
    const { GlossaryForm } = await import("@/components/glossary/GlossaryForm");
    const { emptyGlossaryForm } = await import("@/lib/glossary");
    const html = renderToStaticMarkup(React.createElement(GlossaryForm, { initial: emptyGlossaryForm(), onSaved: () => undefined, onCancel: () => undefined }));
    for (const text of ["English / Source term", "ASL Gloss / Target rendering", "a gloss or a short sign note", "the equivalent term", "Source language", "Target language", "Setting (optional)", "Context note (optional)", "No client names or patient details", "Save term", "Cancel"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes('id="gl-term"') && html.includes('id="gl-rendering"') && html.includes("data-glossary-form"));
  });
});

describe("the Prep page", () => {
  const tabs = async (files: unknown[], glossary: unknown) => {
    const { PrepTabs } = await import("@/components/prep/PrepTabs");
    return renderToStaticMarkup(React.createElement(PrepTabs, { files, glossary } as never));
  };

  it("has Job materials and My glossary tabs, and opens on the glossary when no agency has shared anything", async () => {
    const html = await tabs([], { status: "ok", terms: terms(1) });
    assert.ok(html.includes("Job materials") && html.includes("My glossary"));
    assert.match(html, /id="prep-tab-glossary"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="prep-tab-glossary"/);
    assert.match(html, /id="prep-panel-materials"[^>]*hidden=""/);
    assert.ok(html.includes("data-glossary=") && html.includes("No prep materials yet"), "both panels are in the page; the other is only hidden");
  });

  it("says so plainly when the glossary table is not on this database yet, without failing the materials", async () => {
    const html = await tabs([], { status: "not_ready" });
    assert.ok(html.includes("The glossary is not set up on this database yet") && !html.includes("data-glossary="));
    assert.ok(html.includes("No prep materials yet"));
  });
});

describe("the files of the glossary", () => {
  const files = [
    ["src", "db", "glossarySchema.ts"], ["src", "lib", "glossary.ts"], ["src", "lib", "glossaryFilters.ts"], ["src", "lib", "glossaryStore.ts"], ["src", "lib", "glossaryData.ts"], ["src", "lib", "glossaryImport.ts"],
    ["src", "lib", "validation", "glossaryTerm.ts"], ["src", "app", "actions", "glossary.ts"], ["src", "app", "api", "glossary", "export", "route.ts"], ["src", "app", "(interpreter)", "prep", "page.tsx"],
    ["src", "components", "prep", "PrepTabs.tsx"], ["src", "components", "glossary", "GlossaryBoard.tsx"], ["src", "components", "glossary", "GlossaryCard.tsx"], ["src", "components", "glossary", "GlossaryForm.tsx"],
    ["src", "components", "glossary", "GlossaryList.tsx"], ["src", "components", "glossary", "GlossaryToolbar.tsx"], ["src", "components", "glossary", "GlossaryImportPanel.tsx"],
  ];

  it("are each under 300 lines, hold no any and no em-dash", () => {
    for (const parts of files) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b|any\[\]/.test(source), `${name} has no any`);
      assert.ok(!source.includes(EM_DASH), `${name} has no em-dash`);
    }
  });

  it("the migration is one additive table, no change to an existing table, and the actions and readers are plain interpreter-scoped code", () => {
    const sql = read("src", "db", "migrations", "manual", "0015_glossary.sql");
    assert.equal((sql.match(/CREATE TABLE/g) ?? []).length, 1);
    assert.ok(!/ALTER TABLE|DROP |DELETE FROM|UPDATE /i.test(sql.replace(/--.*$/gm, "")));
    assert.match(read("src", "app", "actions", "glossary.ts"), /^"use server";/);
    for (const parts of [["src", "lib", "glossaryStore.ts"], ["src", "lib", "glossaryData.ts"], ["src", "lib", "glossaryImport.ts"]]) assert.ok(!/^"use server";/m.test(read(...parts)), `${parts.join("/")} is not an endpoint`);
    assert.match(read("src", "lib", "glossaryData.ts"), /requireInterpreter\(\)/);
    assert.match(read("src", "app", "api", "glossary", "export", "route.ts"), /requireInterpreter\(\)/);
  });

  it("no agency-side code reads the glossary table", () => {
    const hits = ["src/app/actions", "src/lib", "src/app/(dashboard)", "src/components/agency", "src/components/interpreters"].flatMap((dir) => {
      const base = join(process.cwd(), ...dir.split("/"));
      const walk = (d: string): string[] => {
        return readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
      };
      try { return walk(base); } catch { return []; }
    });
    const readers = hits.filter((f) => /\.(ts|tsx)$/.test(f) && /interpreterGlossaryTerms|interpreter_glossary_terms/.test(readFileSync(f, "utf8")));
    const allowed = ["glossary.ts", "glossaryStore.ts", "glossaryData.ts"];
    assert.deepEqual(readers.filter((f) => !allowed.some((a) => f.endsWith(`${a}`))), []);
  });
});
