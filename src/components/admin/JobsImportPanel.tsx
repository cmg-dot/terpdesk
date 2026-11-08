"use client";

import { JobsReportView } from "@/components/admin/JobsReportView";
import { WorkbookDropZone } from "@/components/admin/WorkbookDropZone";
import { useJobsImport } from "@/hooks/useJobsImport";
import { JOBS_SHEET_LABEL } from "@/lib/jobImport/types";

const secondaryButton = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const primaryButton = "rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:cursor-not-allowed disabled:opacity-60";

/** Upload, check, confirm: the whole historical-jobs import. Reads only the jobs sheet of the same workbook. */
export const JobsImportPanel = () => {
  const { phase, fileName, report, error, chooseFile, confirmImport, reset, allowPartial, setAllowPartial } = useJobsImport();
  const busy = phase === "checking" || phase === "importing";
  const nothingToSave = report ? report.outcome.created === 0 : true;

  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6">
      {phase !== "done" && (
        <>
          <WorkbookDropZone fileName={fileName} disabled={busy} onFile={chooseFile} />
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input type="checkbox" checked={allowPartial} disabled={busy} onChange={(e) => setAllowPartial(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--forest)]" />
            <span>
              Link a name that is only the first part of one person&apos;s name (“Karen” → Karen Ames, “Kelly B” → Kelly Brown). Names that could be more
              than one person are never linked. Every such match is listed in the preview.
            </span>
          </label>
        </>
      )}

      {phase === "checking" && <p role="status" className="text-sm text-gray-600">Reading the Jobs sheet…</p>}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}

      {report && (phase === "checked" || phase === "importing" || phase === "done") && (
        <>
          {phase === "done" ? (
            <p role="status" className="text-base font-semibold text-emerald-800">Import finished.</p>
          ) : (
            <p className="text-sm text-gray-600">Nothing has been saved yet. Check the dates and names below, then confirm.</p>
          )}
          <JobsReportView report={report} done={phase === "done"} />
          <div className="flex flex-wrap gap-3">
            {phase !== "done" && (
              <button type="button" onClick={confirmImport} disabled={busy || nothingToSave} className={primaryButton}>
                {phase === "importing" ? "Importing…" : `Import ${report.outcome.created} ${report.outcome.created === 1 ? "job" : "jobs"} now`}
              </button>
            )}
            <button type="button" onClick={reset} disabled={busy} className={secondaryButton}>
              {phase === "done" ? "Import another file" : "Choose a different file"}
            </button>
          </div>
        </>
      )}

      {phase === "idle" && !error && (
        <p className="text-[13px] text-gray-500">
          Use the same workbook. Only the sheet whose name contains <strong>{JOBS_SHEET_LABEL}</strong> is read. It has no header row, so columns are read
          by position (counting from 0): <strong>1</strong> Date, <strong>2</strong> Location, <strong>3</strong> Time range, <strong>6</strong> Interpreter,{" "}
          <strong>7</strong> Consumer. Times are read as Pacific time. Cells naming several people (“A &amp; B”, “A / B”, “A and B”) are split, and each
          person is matched to your roster.
        </p>
      )}
    </section>
  );
};
