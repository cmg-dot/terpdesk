"use client";

import { useState } from "react";
import { FileText, FolderOpen } from "lucide-react";
import { openStoredFile } from "@/lib/openFile";
import { formatFileSize } from "@/lib/validation/file";
import type { InterpreterPrepFile } from "@/lib/validation/file";

const formatJobDate = (iso: string | null): string => {
  if (!iso) return "Date to be confirmed";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Date to be confirmed"
    : d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/** Interpreter "Prep" page: files agencies shared for jobs this interpreter is booked on, grouped by job. */
export const PrepMaterialsTab = ({ files }: { files: InterpreterPrepFile[] }) => {
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  if (files.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center sm:p-10">
        <FolderOpen className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
        <h2 className="text-balance break-words text-lg font-semibold text-[var(--ink)]">No prep materials yet</h2>
        <p className="mx-auto mt-1 max-w-md break-words text-sm text-[var(--sage)]">
          Nothing has been shared with you. When an agency shares files for a job you are booked on, they appear here.
        </p>
      </div>
    );
  }

  const jobs = Array.from(
    files.reduce((map, f) => map.set(f.jobId, [...(map.get(f.jobId) ?? []), f]), new Map<string, InterpreterPrepFile[]>()),
  );

  const open = async (fileId: string) => {
    if (openingId) return;
    setOpeningId(fileId);
    setError(null);
    const problem = await openStoredFile(fileId);
    if (problem) setError(problem);
    setOpeningId(null);
  };

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {jobs.map(([jobId, jobFiles]) => (
        <section key={jobId} className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">Job {jobFiles[0].jobReference}</h2>
            <span className="text-[13px] text-gray-500">{formatJobDate(jobFiles[0].jobStartsAt)}</span>
          </div>
          <ul className="divide-y divide-stone-200 rounded-xl bg-stone-50">
            {jobFiles.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => open(f.id)}
                  disabled={openingId !== null}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-stone-100 disabled:opacity-60"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">{f.fileName}</span>
                  <span className="shrink-0 text-xs text-gray-500">{openingId === f.id ? "Opening…" : formatFileSize(f.sizeBytes)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[12px] text-gray-500">Files open through private links that expire after a few minutes. Please don&apos;t forward them.</p>
    </div>
  );
};
