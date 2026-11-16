"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { archiveCredential } from "@/app/actions/credentials";
import { CredentialFileUpload } from "@/components/profile/CredentialFileUpload";
import { actionButton, badgeBase, credentialLines, expiryStatus, neutralBadge } from "@/components/profile/credentialFormat";
import type { MyCredential } from "@/lib/validation/credential";
import type { CredentialFile } from "@/lib/validation/file";

interface CredentialCardProps {
  credential: MyCredential;
  /** The interpreter's profile time zone: expiry is judged against "today" there. */
  timeZone: string;
  onEdit: () => void;
  onArchived: () => void;
  onFilesChange: (files: CredentialFile[]) => void;
}

/** One credential in display mode: details and badges, actions and supporting files. Active credentials are visible to the agency. */
export const CredentialCard = ({ credential: c, timeZone, onEdit, onArchived, onFilesChange }: CredentialCardProps) => {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = expiryStatus(c.expirationDate, timeZone);
  const { details, dates } = credentialLines(c);

  const archive = async () => {
    if (archiving) return;
    setArchiving(true);
    setError(null);
    try {
      const result = await archiveCredential(c.id);
      if (result.success) onArchived();
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <li className="space-y-5 rounded-2xl border border-stone-200 bg-stone-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold text-[var(--ink)]">{c.name}</h3>
            <span className={neutralBadge}>{c.type}</span>
            {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
          </div>
          {details.length > 0 && <p className="text-[13px] text-gray-600">{details.join(" · ")}</p>}
          {dates.length > 0 && <p className="text-[13px] text-gray-500">{dates.join(" · ")}</p>}
          {c.notes && <p className="whitespace-pre-line pt-1 text-[13px] text-gray-600">{c.notes}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={neutralBadge}>Self-reported</span>
          <span className={`${badgeBase} border-[#BCE1D1] bg-[var(--mint-pale)] text-[var(--mint-pale-ink)]`}>
            <Building2 className="h-3 w-3" aria-hidden="true" />
            Visible to your agency
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {confirmingArchive ? (
          <div role="alertdialog" aria-label={`Archive ${c.name}?`} className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-gray-700">Archive this credential? Agencies will no longer see it or its files.</span>
            <button type="button" onClick={archive} disabled={archiving} className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-60">
              {archiving ? "Archiving…" : "Yes, archive"}
            </button>
            <button type="button" onClick={() => setConfirmingArchive(false)} disabled={archiving} className={actionButton}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button type="button" onClick={onEdit} className={actionButton}>Edit</button>
            <button type="button" onClick={() => setConfirmingArchive(true)} className={actionButton}>Archive</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}

      <CredentialFileUpload credentialId={c.id} files={c.files} onFilesChange={onFilesChange} />
    </li>
  );
};
