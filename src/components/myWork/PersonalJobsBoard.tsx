"use client";

import { useMemo, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Download, Plus } from "lucide-react";
import { deletePersonalJob } from "@/app/actions/personalJobs";
import { MyWorkTotals } from "@/components/myWork/MyWorkTotals";
import { PersonalJobForm } from "@/components/myWork/PersonalJobForm";
import { PersonalJobRow } from "@/components/myWork/PersonalJobRow";
import type { MileageRange } from "@/lib/mileageSummary";
import { emptyPersonalJobForm, personalJobFormValues, personalJobsInRange } from "@/lib/personalJobs";
import type { PersonalJobFormValues, PersonalJobView } from "@/lib/personalJobs";

interface PersonalJobsBoardProps {
  initialJobs: PersonalJobView[];
  /** The zone a new job starts in (the interpreter's profile zone). */
  defaultTimeZone: string;
  /** When the jobs were read (ISO): the 30 and 90 day windows end here. */
  generatedAt: string;
}

const PAGE_SIZE = 20;
type Editor = { mode: "new"; values: PersonalJobFormValues } | { mode: "edit"; job: PersonalJobView; values: PersonalJobFormValues };

/** My work: totals that double as the date filter, the form, the list, and the CSV download. */
export function PersonalJobsBoard({ initialJobs, defaultTimeZone, generatedAt }: PersonalJobsBoardProps) {
  const [jobs, setJobs] = useState<PersonalJobView[]>(initialJobs);
  const [range, setRange] = useState<MileageRange>("30");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [notice, setNotice] = useState<string | null>(null);
  const nowMs = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const inRange = useMemo(() => personalJobsInRange(jobs, range, nowMs), [jobs, range, nowMs]);

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
    <div className="space-y-6" data-my-work="">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={openNew} className="inline-flex items-center gap-2 rounded-full bg-[var(--forest)] px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:opacity-90">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a personal job
        </button>
        {jobs.length > 0 && (
          <a href="/api/my-work/export" download className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-[14px] font-medium text-gray-700 transition-colors hover:bg-[var(--surface)]">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
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

      <MyWorkTotals jobs={jobs} range={range} onRange={(next) => { setRange(next); setShownCount(PAGE_SIZE); }} nowMs={nowMs} />

      {jobs.length === 0 ? (
        <div data-my-work-empty="none" className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="text-[16px] font-semibold text-[var(--ink)]">No personal jobs yet</h2>
          <p className="text-sm leading-relaxed text-[var(--sage)]">
            Add the work you do on your own, outside any agency, with its hours and miles. Your totals appear above, you can export everything as a CSV, and an agency
            job that overlaps one of these cannot be accepted.
          </p>
        </div>
      ) : inRange.length === 0 ? (
        <div data-my-work-empty="range" className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-[var(--sage)]">
          No personal jobs in this period. Choose a longer one above.
        </div>
      ) : (
        <>
          <ul className="space-y-3" aria-label="Personal jobs">
            {inRange.slice(0, shownCount).map((job) => (
              <PersonalJobRow key={job.id} job={job} onEdit={openEdit} onDelete={remove} />
            ))}
          </ul>
          {inRange.length > shownCount && (
            <button type="button" onClick={() => setShownCount((n) => n + PAGE_SIZE)} className="rounded-full border border-gray-200 bg-white px-5 py-2 text-[13px] font-medium text-gray-700 hover:bg-[var(--surface)]">
              Show {Math.min(PAGE_SIZE, inRange.length - shownCount)} more ({inRange.length - shownCount} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}
