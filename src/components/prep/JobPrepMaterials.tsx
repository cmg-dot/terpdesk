"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { getPrepFilesForJob } from "@/app/actions/fileAccess";
import { openStoredFile } from "@/lib/openFile";
import { formatFileSize } from "@/lib/validation/file";
import type { PrepFile } from "@/lib/validation/file";

/** "Prep materials" card on the interpreter's Job view: files the agency shared for this job's request. */
export const JobPrepMaterials = ({ requestId, cardClass }: { requestId: string; cardClass: string }) => {
  const [files, setFiles] = useState<PrepFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPrepFilesForJob(requestId)
      .then((list) => !cancelled && setFiles(list))
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const open = async (fileId: string) => {
    if (openingId) return;
    setOpeningId(fileId);
    setError(null);
    const problem = await openStoredFile(fileId);
    if (problem) setError(problem);
    setOpeningId(null);
  };

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-[var(--ink)] mb-4">Prep materials</h2>
      {files === null ? (
        <p className="text-[14px] text-[var(--sage)]">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-[14px] text-[var(--sage)]">No prep materials have been shared for this job.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl bg-stone-50">
          {files.map((f) => (
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
      )}
      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  );
};
