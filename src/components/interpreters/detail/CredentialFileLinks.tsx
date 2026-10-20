"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { openStoredFile } from "@/lib/openFile";
import { formatFileSize } from "@/lib/validation/file";
import type { CredentialFile } from "@/lib/validation/file";

/** Supporting files an interpreter shared with this agency. Each opens through a short-lived signed link. */
export const CredentialFileLinks = ({ files }: { files: CredentialFile[] }) => {
  const [error, setError] = useState<string | null>(null);
  if (files.length === 0) return null;

  const open = async (fileId: string) => {
    setError(null);
    const problem = await openStoredFile(fileId);
    if (problem) setError(problem);
  };

  return (
    <div className="mt-2">
      <ul className="space-y-1">
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => open(f.id)} className="inline-flex max-w-full items-center gap-2 text-left text-[13px] font-medium text-[#0B3B32] hover:underline">
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{f.fileName}</span>
              <span className="shrink-0 text-xs font-normal text-gray-500">{formatFileSize(f.sizeBytes)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
