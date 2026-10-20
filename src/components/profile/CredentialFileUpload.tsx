"use client";

import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { deleteCredentialFile, presignCredentialFile, saveCredentialFile } from "@/app/actions/credentialFiles";
import { openStoredFile } from "@/lib/openFile";
import { CREDENTIAL_FILE_TYPES, MAX_CREDENTIAL_FILE_BYTES, MAX_FILES_PER_CREDENTIAL, formatFileSize } from "@/lib/validation/file";
import type { CredentialFile } from "@/lib/validation/file";

interface CredentialFileUploadProps {
  credentialId: string;
  files: CredentialFile[];
  /** Receives the new list after every add or delete. */
  onFilesChange: (files: CredentialFile[]) => void;
}

/**
 * "Add a supporting file" for one credential. Choosing a file uploads it straight to S3 through a signed link and
 * attaches it to the credential. Files are private to the interpreter unless the credential is shared with an
 * agency with supporting files included.
 */
export const CredentialFileUpload = ({ credentialId, files, onFilesChange }: CredentialFileUploadProps) => {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setError(null);
    if (!(file.type in CREDENTIAL_FILE_TYPES)) return setError("Choose a PDF, JPEG or PNG file.");
    if (file.size > MAX_CREDENTIAL_FILE_BYTES) return setError("That file is larger than 10 MB. Choose a smaller one.");

    setBusy(true);
    try {
      setStatus("Preparing upload…");
      const presign = await presignCredentialFile({ credentialId, fileName: file.name, fileType: file.type, fileSize: file.size });
      if (!presign.success) return setError(presign.error);

      setStatus("Uploading…");
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) return setError("The upload failed. Please try again.");

      setStatus("Saving…");
      const saved = await saveCredentialFile({ credentialId, key: presign.key, fileName: file.name });
      if (!saved.success) return setError(saved.error);
      onFilesChange([saved.file, ...files]);
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setStatus(null);
      setBusy(false);
    }
  };

  const open = async (fileId: string) => {
    setError(null);
    const problem = await openStoredFile(fileId);
    if (problem) setError(problem);
  };

  const remove = async (fileId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteCredentialFile(fileId);
      if (result.success) {
        onFilesChange(files.filter((f) => f.id !== fileId));
        setConfirmingId(null);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const atLimit = files.length >= MAX_FILES_PER_CREDENTIAL;

  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-semibold text-[var(--ink)]">Supporting files</h4>

      {files.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl bg-white px-4">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <button type="button" onClick={() => open(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-[var(--ink)] hover:underline">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="truncate">{f.fileName}</span>
                <span className="shrink-0 text-xs font-normal text-gray-500">{formatFileSize(f.sizeBytes)}</span>
              </button>
              {confirmingId === f.id ? (
                <span className="flex shrink-0 items-center gap-2" role="alertdialog" aria-label={`Delete ${f.fileName}?`}>
                  <button type="button" onClick={() => remove(f.id)} disabled={busy} className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmingId(null)} disabled={busy} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmingId(f.id)} aria-label={`Delete ${f.fileName}`} className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input id={inputId} type="file" accept="application/pdf, image/jpeg, image/png" onChange={upload} disabled={busy || atLimit} className="sr-only" />
      <label
        htmlFor={inputId}
        aria-disabled={busy || atLimit}
        className={`flex flex-col items-start gap-1 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-[#0B3B32]/40 sm:flex-row sm:items-center sm:gap-3 ${
          busy || atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#0B3B32]"
        }`}
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#0B3B32]">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {busy ? status ?? "Working…" : "Add a supporting file"}
        </span>
        <span className="text-[12px] text-gray-500">{atLimit ? `Limit of ${MAX_FILES_PER_CREDENTIAL} files reached` : "No file chosen"}</span>
      </label>
      <p className="text-[12px] text-gray-500">
        PDF, JPEG or PNG, up to 10 MB. Files stay private to you unless you share this credential with an agency and
        include supporting files.
      </p>
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
