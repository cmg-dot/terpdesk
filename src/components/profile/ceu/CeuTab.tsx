"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence } from "framer-motion";
import { Download, GraduationCap, Plus } from "lucide-react";
import { deleteCycle, deleteEntry, loadMyCeu } from "@/app/actions/ceu";
import { CeuPrivateBanner } from "@/components/profile/ceu/CeuPrivateBanner";
import { CeuToolbar } from "@/components/profile/ceu/CeuToolbar";
import { CycleCard } from "@/components/profile/ceu/CycleCard";
import { CycleForm } from "@/components/profile/ceu/CycleForm";
import { EntryForm } from "@/components/profile/ceu/EntryForm";
import { EntryList } from "@/components/profile/ceu/EntryList";
import { MyWorkPager } from "@/components/myWork/MyWorkPager";
import { Reveal } from "@/components/myWork/Reveal";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { emptyCycleForm, emptyEntryForm, orderCycles, todayIn } from "@/lib/ceu";
import type { CeuView, CycleView, EntryFormValues, EntryView } from "@/lib/ceu";
import type { CeuData } from "@/lib/ceuData";
import { DEFAULT_CEU_FILTERS, applyCeuFilters, ceuExportQuery } from "@/lib/ceuFilters";
import type { CeuFilters } from "@/lib/ceuFilters";
import { pageWindow } from "@/lib/personalJobFilters";
import type { MyCredential } from "@/lib/validation/credential";

interface CeuTabProps {
  /** The tab's records, kept by the page so switching tabs does not reload them. Null until the first load. */
  data: CeuData | null;
  onData: Dispatch<SetStateAction<CeuData | null>>;
  /** For the optional credential link on a cycle. */
  credentials: MyCredential[];
  timeZone: string;
}

const PER_PAGE = 10;
const BOX = "rounded-2xl border border-dashed border-[var(--banner-edge)] bg-white p-6 text-sm text-[var(--sage)] sm:p-8";
const TOP = "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors";
const SOLID = `${TOP} bg-[var(--forest)] text-white hover:opacity-90`;
const OUTLINE = `${TOP} border border-[var(--banner-edge)] bg-white text-[var(--ink)] hover:bg-[var(--surface)]`;
const MESSAGES: Record<"not_ready" | "not_linked" | "error", string> = {
  not_ready: "Renewal tracking is not set up on this database yet. Please check back soon.",
  not_linked: "Connect your interpreter profile (use the link we emailed you) to track renewals and CEUs.",
  error: "We could not load your renewals. Please try again.",
};

/** "My Profile" CEUs & renewals tab: private renewal cycles with progress, and the CEU log (search, filters, ten a page, CSV). Loads when first opened. */
export function CeuTab({ data, onData, credentials, timeZone }: CeuTabProps) {
  const asked = useRef(false);
  useEffect(() => {
    if (data !== null || asked.current) return;
    asked.current = true;
    loadMyCeu().then(onData).catch(() => onData({ status: "error" }));
  }, [data, onData]);

  return (
    <div className="space-y-6" data-ceu-tab="">
      <CeuPrivateBanner />
      {data === null && <p role="status" className={BOX}>Loading your renewals...</p>}
      {data !== null && data.status !== "ok" && (
        <div role="alert" className={BOX}>
          <p>{MESSAGES[data.status]}</p>
          {data.status === "error" && (
            <button type="button" onClick={() => { asked.current = false; onData(null); }} className={`${OUTLINE} mt-4`}>
              Try again
            </button>
          )}
        </div>
      )}
      {data?.status === "ok" && (
        <CeuBoard view={data} onView={(next) => onData((current) => (current?.status === "ok" ? { status: "ok", ...next(current) } : current))} credentials={credentials} timeZone={timeZone} />
      )}
    </div>
  );
}

interface BoardProps {
  view: CeuView;
  onView: (update: (current: CeuView) => CeuView) => void;
  credentials: MyCredential[];
  timeZone: string;
}

function CeuBoard({ view, onView, credentials, timeZone }: BoardProps) {
  const { cycles, entries } = view;
  const today = todayIn(timeZone);
  const [filters, setFilters] = useState<CeuFilters>(DEFAULT_CEU_FILTERS);
  const [newCycle, setNewCycle] = useState(false);
  const [adding, setAdding] = useState<EntryFormValues | null>(null);
  const [editingCycle, setEditingCycle] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const logTop = useRef<HTMLDivElement>(null);
  const listTop = useRef<HTMLDivElement>(null);
  const { reduce } = useHoursMotion();

  const ordered = useMemo(() => orderCycles(cycles, today), [cycles, today]);
  const matching = useMemo(() => applyCeuFilters(entries, filters), [entries, filters]);
  const choiceKey = JSON.stringify(filters);
  const [pager, setPager] = useState<{ view: string; page: number }>({ view: choiceKey, page: 1 });
  if (pager.view !== choiceKey) setPager({ view: choiceKey, page: 1 });
  const slot = pageWindow(matching.length, pager.view === choiceKey ? pager.page : 1, PER_PAGE);
  const visible = matching.slice(slot.start, slot.end);
  const smooth = reduce ? "auto" : "smooth";
  const goToPage = (page: number) => {
    setPager({ view: choiceKey, page });
    const top = listTop.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start", behavior: smooth });
  };

  const openAdd = (cycle?: CycleView) => {
    setNotice(null);
    const start = emptyEntryForm(cycles, today);
    setAdding(cycle ? { ...start, cycleId: cycle.id, unit: cycle.unit } : start);
    window.setTimeout(() => logTop.current?.scrollIntoView({ block: "start", behavior: smooth }), 0);
  };
  const savedCycle = (cycle: CycleView) => {
    const edited = editingCycle === cycle.id;
    onView((v) => ({ ...v, cycles: [cycle, ...v.cycles.filter((c) => c.id !== cycle.id)] }));
    setNotice(edited ? "Cycle saved." : "Cycle added.");
    setEditingCycle(null);
    setNewCycle(false);
  };
  const removeCycle = async (cycle: CycleView): Promise<string | null> => {
    try {
      const result = await deleteCycle(cycle.id);
      if (!result.success) return result.error;
      onView((v) => ({ cycles: v.cycles.filter((c) => c.id !== cycle.id), entries: v.entries.map((e) => (e.cycleId === cycle.id ? { ...e, cycleId: null } : e)) }));
      setFilters((f) => (f.cycle === cycle.id ? { ...f, cycle: "" } : f));
      setNotice("Cycle deleted. Its entries are still in your log.");
      return null;
    } catch {
      return "Something went wrong. Please try again.";
    }
  };
  const savedEntry = (entry: EntryView) => {
    const edited = editingEntry === entry.id;
    onView((v) => ({ ...v, entries: [entry, ...v.entries.filter((e) => e.id !== entry.id)] }));
    setNotice(edited ? "Changes saved." : "Entry added.");
    if (edited) setEditingEntry(null);
    else setAdding(null);
  };
  const removeEntry = async (entry: EntryView): Promise<string | null> => {
    try {
      const result = await deleteEntry(entry.id);
      if (!result.success) return result.error;
      onView((v) => ({ ...v, entries: v.entries.filter((e) => e.id !== entry.id) }));
      setNotice("Entry deleted.");
      return null;
    } catch {
      return "Something went wrong. Please try again.";
    }
  };
  const exportQuery = ceuExportQuery(filters);

  return (
    <>
      <section aria-labelledby="ceu-cycles" className="space-y-4" data-ceu-cycles="">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ceu-cycles" className="text-lg font-semibold text-[var(--ink)]">Renewal cycles</h2>
          <button type="button" onClick={() => { setNotice(null); setNewCycle(true); }} className={SOLID}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New cycle
          </button>
        </div>
        <AnimatePresence initial={false}>
          {newCycle && (
            <Reveal key="new-cycle">
              <CycleForm initial={emptyCycleForm(today)} credentials={credentials} onSaved={savedCycle} onCancel={() => setNewCycle(false)} />
            </Reveal>
          )}
        </AnimatePresence>
        {ordered.length === 0 ? (
          <div data-ceu-empty="cycles" className={BOX}>
            <GraduationCap className="mb-2 h-6 w-6 text-[var(--forest)]" aria-hidden="true" />
            <h3 className="text-[16px] font-semibold text-[var(--ink)]">No renewal cycles yet</h3>
            <p className="mt-1 leading-relaxed">
              Add the period your certification or license renews on, and what it asks for. You can link a credential from your Credentials tab, or track a cycle on its own.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {ordered.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                entries={entries}
                credentials={credentials}
                timeZone={timeZone}
                editing={editingCycle === cycle.id}
                onEdit={(c) => { setNotice(null); setEditingCycle(c.id); }}
                onSaved={savedCycle}
                onCancelEdit={() => setEditingCycle(null)}
                onDelete={removeCycle}
                onLog={openAdd}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ceu-log" className="space-y-5" data-ceu-log="">
        <div ref={logTop} className="scroll-mt-4 space-y-4">
          <h2 id="ceu-log" className="text-lg font-semibold text-[var(--ink)]">CEU log</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => openAdd()} className={SOLID}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Log a training
            </button>
            {matching.length > 0 && (
              <a
                href={`/api/profile/ceu/export${exportQuery ? `?${exportQuery}` : ""}`}
                download
                aria-label={`Export CSV, ${matching.length} ${matching.length === 1 ? "entry" : "entries"} shown`}
                data-export-count={matching.length}
                className={OUTLINE}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
                <span className="rounded-full bg-[var(--tint)] px-2 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{matching.length}</span>
              </a>
            )}
            {notice && <p role="status" className="text-[13px] font-medium text-[var(--tint-ink)]">{notice}</p>}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {adding && (
            <Reveal key="add-entry">
              <EntryForm initial={adding} cycles={cycles} onSaved={savedEntry} onCancel={() => setAdding(null)} />
            </Reveal>
          )}
        </AnimatePresence>

        {entries.length === 0 ? (
          <div data-ceu-empty="entries" className={BOX}>
            <h3 className="text-[16px] font-semibold text-[var(--ink)]">Nothing logged yet</h3>
            <p className="mt-1 leading-relaxed">Log a workshop, course or other training as you finish it. It counts toward a cycle you choose, and the log stays private to you.</p>
          </div>
        ) : (
          <>
            <CeuToolbar filters={filters} cycles={ordered} shown={matching.length} total={entries.length} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} onClear={() => setFilters(DEFAULT_CEU_FILTERS)} />
            {matching.length === 0 ? (
              <div data-ceu-empty="match" className={`${BOX} text-center`}>
                <p className="font-medium text-[var(--ink)]">No entries match</p>
                <p className="mt-1">Try a different search, cycle or focus, or clear the filters.</p>
                <button type="button" onClick={() => setFilters(DEFAULT_CEU_FILTERS)} className="mt-4 rounded-full border border-[var(--forest)] px-5 py-1.5 text-[13px] font-medium text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]">
                  Clear filters
                </button>
              </div>
            ) : (
              <EntryList ref={listTop} entries={visible} cycles={cycles} page={slot.page} editingId={editingEntry} onEdit={(e) => { setNotice(null); setEditingEntry(e.id); }} onSaved={savedEntry} onCancelEdit={() => setEditingEntry(null)} onDelete={removeEntry} />
            )}
            <MyWorkPager window={slot} total={matching.length} onPage={goToPage} />
          </>
        )}
      </section>
    </>
  );
}
