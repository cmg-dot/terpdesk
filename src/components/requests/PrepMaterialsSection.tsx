"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { deletePrepFile, generatePresignedUrl, listPrepFiles, saveFileRecord, setPrepFileVisibility } from "@/app/actions/files";
import { openStoredFile } from "@/lib/openFile";
import { MAX_PREP_FILE_BYTES, PREP_FILE_ACCEPT, PREP_FILE_TYPES, formatFileSize } from "@/lib/validation/file";
import type { PrepFile } from "@/lib/validation/file";

const selectClass =
  "rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/40";

/**
 * Agency request page "Prep materials": upload straight to S3 (signed PUT), then record the file. Each file is
 * either agency only or shared with the interpreters booked on this job. Files open through short-lived links.
 */
export const PrepMaterialsSection = ({ requestId, cardClass }: { requestId: string; cardClass: string }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PrepFile[] | null>(null);
  const [shareNext, setShareNext] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPrepFiles(requestId).then(setFiles).catch(() => setFiles([]));
  }, [requestId]);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setError(null);
    if (!(file.type in PREP_FILE_TYPES)) return setError("Choose a PDF, image, Word or text file.");
    if (file.size > MAX_PREP_FILE_BYTES) return setError("Files can be up to 25 MB.");

    setBusy(true);
    try {
      setStatus("Preparing upload…");
      const presign = await generatePresignedUrl({ requestId, fileName: file.name, fileType: file.type, fileSize: file.size });
      if (!presign.success) return setError(presign.error);

      setStatus("Uploading…");
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) return setError("The upload failed. Please try again.");

      setStatus("Saving…");
      const saved = await saveFileRecord({ requestId, key: presign.key, fileName: file.name, sharedWithInterpreters: shareNext });
      if (!saved.success) return setError(saved.error);
      setFiles((prev) => [saved.file, ...(prev ?? [])]);
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setStatus(null);
      setBusy(false);
    }
  };

  const changeVisibility = async (file: PrepFile, shared: boolean) => {
    setError(null);
    setFiles((prev) => (prev ?? []).map((f) => (f.id === file.id ? { ...f, sharedWithInterpreters: shared } : f)));
    const result = await setPrepFileVisibility({ fileId: file.id, sharedWithInterpreters: shared }).catch(() => null);
    if (!result?.success) {
      setFiles((prev) => (prev ?? []).map((f) => (f.id === file.id ? file : f)));
      setError(result?.error ?? "Could not change who can see this file.");
    }
  };

  const remove = async (file: PrepFile) => {
    if (!window.confirm(`Delete "${file.fileName}"? This can't be undone.`)) return;
    setError(null);
    const result = await deletePrepFile(file.id).catch(() => null);
    if (result?.success) setFiles((prev) => (prev ?? []).filter((f) => f.id !== file.id));
    else setError(result?.error ?? "Could not delete this file.");
  };

  const open = async (file: PrepFile) => {
    setError(null);
    const problem = await openStoredFile(file.id);
    if (problem) setError(problem);
  };

  return (
    <div className={cardClass}>
      <h2 className="text-[18px] font-medium text-[var(--ink)] mb-2">Prep materials</h2>

      {files && files.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => open(f)} className="flex min-w-0 items-center gap-2 text-left text-sm font-medium text-[var(--ink)] hover:underline">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="truncate">{f.fileName}</span>
                <span className="shrink-0 text-xs font-normal text-gray-500">{formatFileSize(f.sizeBytes)}</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  aria-label={`Who can see ${f.fileName}`}
                  value={f.sharedWithInterpreters ? "shared" : "agency"}
                  onChange={(e) => changeVisibility(f, e.target.value === "shared")}
                  className={selectClass}
                >
                  <option value="agency">Agency only</option>
                  <option value="shared">Assigned interpreters</option>
                </select>
                <button type="button" onClick={() => remove(f)} aria-label={`Delete ${f.fileName}`} className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {files && files.length === 0 && <p className="text-sm text-gray-500">No prep materials on this request yet.</p>}

      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 flex flex-col gap-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <label htmlFor={`prep-share-${requestId}`} className="text-sm text-gray-600">Who can see this file?</label>
          <select id={`prep-share-${requestId}`} value={shareNext ? "shared" : "agency"} onChange={(e) => setShareNext(e.target.value === "shared")} className={selectClass}>
            <option value="agency">Agency only</option>
            <option value="shared">Assigned interpreters</option>
          </select>
        </div>
        <input ref={inputRef} type="file" accept={PREP_FILE_ACCEPT} onChange={upload} className="sr-only" id={`prep-file-${requestId}`} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {busy ? status ?? "Working…" : "Add a file"}
        </button>
        <p className="text-xs text-gray-500">PDF, images, Word or text, up to 25 MB. Files are stored privately and open through short-lived links.</p>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
};
