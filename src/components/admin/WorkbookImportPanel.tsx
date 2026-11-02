"use client";

import { ImportReportView } from "@/components/admin/ImportReportView";
import { WorkbookDropZone } from "@/components/admin/WorkbookDropZone";
import { useWorkbookImport } from "@/hooks/useWorkbookImport";
import { NON_STATE_SHEET, STATE_SHEET } from "@/lib/workbookImport/types";

const secondaryButton = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const primaryButton = "rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:cursor-not-allowed disabled:opacity-60";

/** Upload, check, confirm: the whole bulk-import flow for the interpreter master workbook. */
export const WorkbookImportPanel = () => {
  const { phase, fileName, report, error, chooseFile, confirmImport, reset } = useWorkbookImport();
  const busy = phase === "checking" || phase === "importing";
  const nothingToSave = report ? report.outcome.created + report.outcome.filledExisting === 0 : true;

  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6">
      {phase !== "done" && <WorkbookDropZone fileName={fileName} disabled={busy} onFile={chooseFile} />}

      {phase === "checking" && <p role="status" className="text-sm text-gray-600">Reading the workbook…</p>}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}

      {report && (phase === "checked" || phase === "importing" || phase === "done") && (
        <>
          {phase === "done" ? (
            <p role="status" className="text-base font-semibold text-emerald-800">Import finished.</p>
          ) : (
            <p className="text-sm text-gray-600">Nothing has been saved yet. Review this, then confirm.</p>
          )}
          <ImportReportView report={report} done={phase === "done"} />
          <div className="flex flex-wrap gap-3">
            {phase !== "done" && (
              <button type="button" onClick={confirmImport} disabled={busy || nothingToSave} className={primaryButton}>
                {phase === "importing" ? "Importing…" : "Import now"}
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
          The workbook needs two sheets: <strong>{STATE_SHEET}</strong> (name, city, certification, Washington and King County hourly rates) and{" "}
          <strong>{NON_STATE_SHEET}</strong> (name, qualifications, insurance expiration, email, non-state rate). People are matched by name, ignoring capital
          letters.
        </p>
      )}
    </section>
  );
};
