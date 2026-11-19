"use client";

import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { deleteCredentialFile, presignCredentialFile, saveCredentialFile } from "@/app/actions/credentialFiles";
import type { DeleteCredentialFileResult, PresignCredentialFileResult, SaveCredentialFileResult } from "@/app/actions/credentialFiles";
import { checkCredentialFile, uploadCredentialFile } from "@/components/profile/uploadCredentialFile";
import { openStoredFile } from "@/lib/openFile";
import { MAX_FILES_PER_CREDENTIAL, formatFileSize } from "@/lib/validation/file";
import type { CredentialFile } from "@/lib/validation/file";

/** The three steps of an upload, and deleting one: the interpreter's own by default; staff pass theirs (actions/staffInsuranceFiles.ts). */
export interface CredentialFileActions {
  presign: (input: { credentialId: string; fileName: string; fileType: string; fileSize: number }) => Promise<PresignCredentialFileResult>;
  save: (input: { credentialId: string; key: string; fileName: string }) => Promise<SaveCredentialFileResult>;
  remove: (fileId: string) => Promise<DeleteCredentialFileResult>;
}

const OWN_ACTIONS: CredentialFileActions = { presign: presignCredentialFile, save: saveCredentialFile, remove: deleteCredentialFile };

interface CredentialFileUploadProps {
  credentialId: string;
  files: CredentialFile[];
  /** Receives the new list after every add or delete. */
  onFilesChange: (files: CredentialFile[]) => void;
  actions?: CredentialFileActions;
  /** Who can open the files, as the reader is told (defaults to the interpreter's wording). */
  privacyNote?: string;
}

/**
 * "Add a supporting file" for one credential. Choosing a file uploads it straight to S3 through a signed link and
 * attaches it to the credential. Stored privately; the interpreter and the staff of the agencies they work with can open
 * them while the credential is active.
 */
export const CredentialFileUpload = ({ credentialId, files, onFilesChange, actions = OWN_ACTIONS, privacyNote }: CredentialFileUploadProps) => {
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
    const problem = checkCredentialFile(file);
    if (problem) return setError(problem);

    setBusy(true);
    const outcome = await uploadCredentialFile(actions, credentialId, file, setStatus);
    setStatus(null);
    setBusy(false);
    if (outcome.ok) onFilesChange([outcome.file, ...files]);
    else setError(outcome.error);
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
      const result = await actions.remove(fileId);
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
        className={`flex flex-col items-start gap-1 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-[rgb(var(--forest-rgb)/0.4)] sm:flex-row sm:items-center sm:gap-3 ${
          busy || atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[var(--forest)]"
        }`}
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--forest)]">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {busy ? status ?? "Working…" : "Add a supporting file"}
        </span>
        <span className="text-[12px] text-gray-500">{atLimit ? `Limit of ${MAX_FILES_PER_CREDENTIAL} files reached` : "No file chosen"}</span>
      </label>
      <p className="text-[12px] text-gray-500">
        PDF, JPEG or PNG, up to 10 MB. {privacyNote ?? "Stored privately: only you and your agency's staff can open them."}
      </p>
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
