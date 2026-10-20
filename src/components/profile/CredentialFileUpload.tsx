"use client";

import { useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Paperclip } from "lucide-react";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * "Add a supporting file" picker for one credential. The file is checked here (type and size) but not uploaded:
 * file storage (S3) is not connected yet, so nothing leaves the browser.
 */
export const CredentialFileUpload = () => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Choose a PDF, JPEG or PNG file.");
      setFileName(null);
    } else if (file.size > MAX_BYTES) {
      setError("That file is larger than 10 MB. Choose a smaller one.");
      setFileName(null);
    } else {
      setError(null);
      setFileName(file.name);
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-semibold text-[var(--ink)]">Supporting files</h4>
      <input ref={inputRef} id={inputId} type="file" accept="application/pdf, image/jpeg, image/png" onChange={onChange} className="sr-only" />
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-3 transition-colors hover:border-[#0B3B32] focus-within:ring-2 focus-within:ring-[#0B3B32]/40 sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#0B3B32]">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Add a supporting file
        </span>
        <span className="truncate text-[12px] text-gray-500">{fileName ?? "No file chosen"}</span>
      </label>
      <p className="text-[12px] text-gray-500">
        PDF, JPEG or PNG, up to 10 MB. Files stay private to you unless you share this credential with an agency and
        include supporting files.
      </p>
      {fileName && (
        <p role="status" className="text-[12px] text-amber-800">
          File uploads are not switched on yet, so this file has not been saved.
        </p>
      )}
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
