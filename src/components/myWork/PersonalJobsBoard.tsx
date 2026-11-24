"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Download, Plus } from "lucide-react";
import { deletePersonalJob } from "@/app/actions/personalJobs";
import { MyWorkToolbar } from "@/components/myWork/MyWorkToolbar";
import { MyWorkTotals } from "@/components/myWork/MyWorkTotals";
import { PersonalJobForm } from "@/components/myWork/PersonalJobForm";
import { PersonalJobRow } from "@/components/myWork/PersonalJobRow";
import { useClockFrom } from "@/hooks/useClockFrom";
import type { MileageRange } from "@/lib/mileageSummary";
import { DEFAULT_JOB_FILTERS, applyPersonalJobFilters, exportQuery, isUpcoming, personalJobSettingOptions, personalJobTabCounts } from "@/lib/personalJobFilters";
import type { PersonalJobFilters } from "@/lib/personalJobFilters";
import { emptyPersonalJobForm, personalJobFormValues, personalJobsInRange } from "@/lib/personalJobs";
import type { PersonalJobFormValues, PersonalJobView } from "@/lib/personalJobs";

interface PersonalJobsBoardProps {
  initialJobs: PersonalJobView[];
  /** The zone a new job starts in (the interpreter's profile zone). */
  defaultTimeZone: string;
  /** When the jobs were read (ISO): the first render's clock, so the page matches the server's HTML. */
  generatedAt: string;
}

const PAGE_SIZE = 20;
type Editor = { mode: "new"; values: PersonalJobFormValues } | { mode: "edit"; job: PersonalJobView; values: PersonalJobFormValues };

const noMatchBox = "rounded-2xl border border-dashed border-[var(--banner-edge)] bg-white p-8 text-center text-sm text-[var(--sage)]";

/** My work: totals that double as the date range, search and filters, the cards, the form, and the CSV download of what is shown. */
export function PersonalJobsBoard({ initialJobs, defaultTimeZone, generatedAt }: PersonalJobsBoardProps) {
  const [jobs, setJobs] = useState<PersonalJobView[]>(initialJobs);
  const [range, setRange] = useState<MileageRange>("30");
  const [filters, setFilters] = useState<PersonalJobFilters>(DEFAULT_JOB_FILTERS);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [more, setMore] = useState<{ view: string; pages: number }>({ view: "", pages: 1 });
  const [notice, setNotice] = useState<string | null>(null);
  // Starts at the moment the server read the jobs (so the first render matches the server's HTML), then follows the real time, so an upcoming job turns into a completed one when it ends.
  const serverNow = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const nowMs = useClockFrom(serverNow);
  const inRange = useMemo(() => personalJobsInRange(jobs, range, nowMs), [jobs, range, nowMs]);
  const counts = useMemo(() => personalJobTabCounts(inRange, nowMs), [inRange, nowMs]);
  const settings = useMemo(() => personalJobSettingOptions(jobs), [jobs]);
  const matching = useMemo(() => applyPersonalJobFilters(inRange, filters, nowMs), [inRange, filters, nowMs]);

  const update = (patch: Partial<PersonalJobFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const clear = () => setFilters((current) => ({ ...DEFAULT_JOB_FILTERS, tab: current.tab }));
  // "Show more" is forgotten whenever the view changes, so a new range, tab, search or sort starts at the top again.
  const view = `${range}|${JSON.stringify(filters)}`;
  const pages = more.view === view ? more.pages : 1;
  const visible = matching.slice(0, pages * PAGE_SIZE);
  const left = matching.length - visible.length;

  const openNew = () => {
    setNotice(null);
    setEditor({ mode: "new", values: emptyPersonalJobForm(defaultTimeZone, formatInTimeZone(new Date(), defaultTimeZone, "yyyy-MM-dd")) });
  };
  const openEdit = (job: PersonalJobView) => {
    setNotice(null);
    setEditor({ mode: "edit", job, values: personalJobFormValues(job) });
  };
  const saved = (job: PersonalJobView) => {
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    setNotice(editor?.mode === "edit" ? "Changes saved." : "Personal job saved.");
    setEditor(null);
  };
  const remove = async (job: PersonalJobView): Promise<string | null> => {
    try {
      const result = await deletePersonalJob(job.id);
      if (!result.success) return result.error;
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setNotice("Personal job deleted.");
      return null;
    } catch {
      return "Something went wrong. Please try again.";
    }
  };

  return (
    <div className="space-y-5" data-my-work="">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--forest)] px-5 text-[14px] font-medium text-white transition-colors hover:opacity-90">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a personal job
        </button>
        {matching.length > 0 && (
          <a
            href={`/api/my-work/export?${exportQuery(range, filters)}`}
            download
            aria-label={`Export CSV, ${matching.length} ${matching.length === 1 ? "job" : "jobs"} shown`}
            data-export-count={matching.length}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--banner-edge)] bg-white px-5 text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
            <span className="rounded-full bg-[var(--tint)] px-2 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{matching.length}</span>
          </a>
        )}
        {notice && <p role="status" className="text-[13px] font-medium text-[var(--tint-ink)]">{notice}</p>}
      </div>

      {editor && (
        <PersonalJobForm
          key={editor.mode === "edit" ? editor.job.id : "new"}
          initial={editor.values}
          editingId={editor.mode === "edit" ? editor.job.id : undefined}
          onSaved={saved}
          onCancel={() => setEditor(null)}
        />
      )}

      <MyWorkTotals jobs={jobs} range={range} onRange={setRange} nowMs={nowMs} />

      {jobs.length === 0 ? (
        <div data-my-work-empty="none" className="space-y-2 rounded-2xl border border-dashed border-[var(--banner-edge)] bg-white p-6 sm:p-8">
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">No personal jobs yet</h2>
          <p className="text-sm leading-relaxed text-[var(--sage)]">
            Add the work you do on your own, outside any agency, with its hours and miles. Your totals appear above, you can export everything as a CSV, and an agency
            job that overlaps one of these cannot be accepted.
          </p>
        </div>
      ) : (
        <>
          <MyWorkToolbar filters={filters} counts={counts} settings={settings} shown={matching.length} onChange={update} onClear={clear} />
          {inRange.length === 0 ? (
            <div data-my-work-empty="range" className={noMatchBox}>
              No personal jobs in this period. Choose a longer one above.
            </div>
          ) : matching.length === 0 ? (
            <div data-my-work-empty="match" className={noMatchBox}>
              <p className="font-medium text-[var(--ink)]">No personal jobs match</p>
              <p className="mt-1">Try a different search, tab or setting, or clear the filters.</p>
              <button type="button" onClick={() => setFilters(DEFAULT_JOB_FILTERS)} className="mt-4 rounded-full border border-[var(--forest)] px-5 py-1.5 text-[13px] font-medium text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]">
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="-mb-3" aria-label="Personal jobs">
              {visible.map((job) => (
                <PersonalJobRow key={job.id} job={job} upcoming={isUpcoming(job, nowMs)} onEdit={openEdit} onDelete={remove} />
              ))}
            </ul>
          )}
          {left > 0 && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setMore({ view, pages: pages + 1 })}
                className="min-h-11 rounded-full border border-[var(--forest)] px-6 text-[13px] font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest)] hover:text-[var(--canvas)]"
              >
                Show {Math.min(PAGE_SIZE, left)} more ({left} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
