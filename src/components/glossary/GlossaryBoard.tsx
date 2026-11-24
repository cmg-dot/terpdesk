"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BookOpen, Download, Plus, Upload } from "lucide-react";
import { deleteGlossaryTerm, listMyGlossaryTerms } from "@/app/actions/glossary";
import { GlossaryForm } from "@/components/glossary/GlossaryForm";
import { GlossaryImportPanel } from "@/components/glossary/GlossaryImportPanel";
import { GlossaryList } from "@/components/glossary/GlossaryList";
import { GlossaryToolbar } from "@/components/glossary/GlossaryToolbar";
import { MyWorkPager } from "@/components/myWork/MyWorkPager";
import { Reveal } from "@/components/myWork/Reveal";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { emptyGlossaryForm } from "@/lib/glossary";
import type { GlossaryFormValues, GlossaryTermView } from "@/lib/glossary";
import { DEFAULT_GLOSSARY_FILTERS, applyGlossaryFilters, glossaryExportQuery, glossaryPairOptions, glossarySettingOptions } from "@/lib/glossaryFilters";
import type { GlossaryFilters } from "@/lib/glossaryFilters";
import { pageWindow } from "@/lib/personalJobFilters";

interface GlossaryBoardProps {
  initialTerms: GlossaryTermView[];
}

const PER_PAGE = 10;
const noMatchBox = "rounded-2xl border border-dashed border-[var(--banner-edge)] bg-white p-8 text-center text-sm text-[var(--sage)]";
const topButton = "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors";

/** The Prep page's Glossary tab: add and edit terms, search and filter them, ten a page, import and export as CSV. */
export function GlossaryBoard({ initialTerms }: GlossaryBoardProps) {
  const [terms, setTerms] = useState<GlossaryTermView[]>(initialTerms);
  const [filters, setFilters] = useState<GlossaryFilters>(DEFAULT_GLOSSARY_FILTERS);
  // The panel at the top is only for a new term; an edit opens inside the term's own card.
  const [adding, setAdding] = useState<GlossaryFormValues | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listTop = useRef<HTMLDivElement>(null);
  const { reduce } = useHoursMotion();

  const pairs = useMemo(() => glossaryPairOptions(terms), [terms]);
  const settings = useMemo(() => glossarySettingOptions(terms), [terms]);
  const matching = useMemo(() => applyGlossaryFilters(terms, filters), [terms, filters]);

  const update = (patch: Partial<GlossaryFilters>) => setFilters((current) => ({ ...current, ...patch }));
  // A new search, pair, setting or sort starts at page 1 again, including one that goes back to a view seen before.
  const view = JSON.stringify(filters);
  const [pager, setPager] = useState<{ view: string; page: number }>({ view, page: 1 });
  if (pager.view !== view) setPager({ view, page: 1 });
  const slot = pageWindow(matching.length, pager.view === view ? pager.page : 1, PER_PAGE);
  const visible = matching.slice(slot.start, slot.end);
  const goToPage = (page: number) => {
    setPager({ view, page });
    const top = listTop.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  const openNew = () => {
    setNotice(null);
    // A run of terms is quick to enter: the form starts in the pair and setting of the newest term.
    const last = terms[0];
    setAdding(emptyGlossaryForm(last?.sourceLang, last?.targetLang, last?.setting));
  };
  const saved = (term: GlossaryTermView) => {
    const edited = editingId === term.id;
    setTerms((prev) => [term, ...prev.filter((t) => t.id !== term.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setNotice(edited ? "Changes saved." : "Term added.");
    if (edited) setEditingId(null);
    else setAdding(null);
  };
  const remove = async (term: GlossaryTermView): Promise<string | null> => {
    try {
      const result = await deleteGlossaryTerm(term.id);
      if (!result.success) return result.error;
      setTerms((prev) => prev.filter((t) => t.id !== term.id));
      setNotice("Term deleted.");
      return null;
    } catch {
      return "Something went wrong. Please try again.";
    }
  };
  const imported = async () => {
    try {
      setTerms(await listMyGlossaryTerms());
    } catch {
      setNotice("Imported. Refresh the page to see the new terms.");
    }
  };

  return (
    <div className="space-y-5" data-glossary="">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={openNew} className={`${topButton} bg-[var(--forest)] text-white hover:opacity-90`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a term
        </button>
        <button type="button" onClick={() => setImporting((open) => !open)} aria-expanded={importing} className={`${topButton} border border-[var(--banner-edge)] bg-white text-[var(--ink)] hover:bg-[var(--surface)]`}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import CSV
        </button>
        {matching.length > 0 && (
          <a
            href={`/api/glossary/export${glossaryExportQuery(filters) ? `?${glossaryExportQuery(filters)}` : ""}`}
            download
            aria-label={`Export CSV, ${matching.length} ${matching.length === 1 ? "term" : "terms"} shown`}
            data-export-count={matching.length}
            className={`${topButton} border border-[var(--banner-edge)] bg-white text-[var(--ink)] hover:bg-[var(--surface)]`}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
            <span className="rounded-full bg-[var(--tint)] px-2 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{matching.length}</span>
          </a>
        )}
        {notice && <p role="status" className="text-[13px] font-medium text-[var(--tint-ink)]">{notice}</p>}
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <Reveal key="add">
            <GlossaryForm initial={adding} onSaved={saved} onCancel={() => setAdding(null)} />
          </Reveal>
        )}
        {importing && (
          <Reveal key="import">
            <GlossaryImportPanel onImported={imported} onClose={() => setImporting(false)} />
          </Reveal>
        )}
      </AnimatePresence>

      {terms.length === 0 ? (
        <div data-glossary-empty="none" className="space-y-2 rounded-2xl border border-dashed border-[var(--banner-edge)] bg-white p-6 sm:p-8">
          <BookOpen className="h-6 w-6 text-[var(--forest)]" aria-hidden="true" />
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">Your glossary is empty</h2>
          <p className="text-sm leading-relaxed text-[var(--sage)]">
            Build your own vocabulary for the settings you work in: medical, legal, education and more. Each term has a source term (English, or another language) and a target
            rendering (an ASL gloss or sign note, or a spoken-language equivalent). It is private to you and works without any agency.
          </p>
        </div>
      ) : (
        <>
          <GlossaryToolbar filters={filters} pairs={pairs} settings={settings} shown={matching.length} total={terms.length} onChange={update} onClear={() => setFilters(DEFAULT_GLOSSARY_FILTERS)} />
          {matching.length === 0 ? (
            <div data-glossary-empty="match" className={noMatchBox}>
              <p className="font-medium text-[var(--ink)]">No terms match</p>
              <p className="mt-1">Try a different search, language pair or setting, or clear the filters.</p>
              <button type="button" onClick={() => setFilters(DEFAULT_GLOSSARY_FILTERS)} className="mt-4 rounded-full border border-[var(--forest)] px-5 py-1.5 text-[13px] font-medium text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]">
                Clear filters
              </button>
            </div>
          ) : (
            <GlossaryList ref={listTop} terms={visible} page={slot.page} editingId={editingId} onEdit={(t) => { setNotice(null); setEditingId(t.id); }} onSaved={saved} onCancelEdit={() => setEditingId(null)} onDelete={remove} />
          )}
          <MyWorkPager window={slot} total={matching.length} onPage={goToPage} />
        </>
      )}
    </div>
  );
}
