"use client";

import { useState } from "react";
import { Lock, Share2 } from "lucide-react";
import { archiveCredential } from "@/app/actions/credentials";
import { CredentialFileUpload } from "@/components/profile/CredentialFileUpload";
import { CredentialSharing } from "@/components/profile/CredentialSharing";
import type { CredentialShare, MyCredential } from "@/lib/validation/credential";

interface CredentialCardProps {
  credential: MyCredential;
  agencies: { id: string; name: string }[];
  onEdit: () => void;
  onArchived: () => void;
  onSharesChange: (shares: CredentialShare[]) => void;
}

const EXPIRING_SOON_DAYS = 60;
const badgeBase = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";
const actionButton = "rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";

/** "2026-03-09" -> "Mar 9, 2026" without shifting the day through a time zone. */
const formatDay = (value: string): string => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const expiryStatus = (expirationDate: string): { label: string; className: string } | null => {
  if (!expirationDate) return null;
  const [y, m, d] = expirationDate.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Expired", className: "border-red-200 bg-red-50 text-red-700" };
  if (days <= EXPIRING_SOON_DAYS) return { label: "Expires soon", className: "border-amber-200 bg-amber-50 text-amber-800" };
  return null;
};

/** One credential in display mode: details and badges, actions, supporting files, and who can see it. */
export const CredentialCard = ({ credential: c, agencies, onEdit, onArchived, onSharesChange }: CredentialCardProps) => {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = expiryStatus(c.expirationDate);
  const sharedCount = c.shares.length;
  const details = [c.issuedBy && `Issued by ${c.issuedBy}`, c.credentialNumber && `No. ${c.credentialNumber}`].filter(Boolean);
  const dates = [c.issueDate && `Issued ${formatDay(c.issueDate)}`, c.expirationDate && `Expires ${formatDay(c.expirationDate)}`].filter(Boolean);

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
            <span className={`${badgeBase} border-stone-200 bg-white text-gray-600`}>{c.type}</span>
            {status && <span className={`${badgeBase} ${status.className}`}>{status.label}</span>}
          </div>
          {details.length > 0 && <p className="text-[13px] text-gray-600">{details.join(" · ")}</p>}
          {dates.length > 0 && <p className="text-[13px] text-gray-500">{dates.join(" · ")}</p>}
          {c.notes && <p className="whitespace-pre-line pt-1 text-[13px] text-gray-600">{c.notes}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`${badgeBase} border-stone-200 bg-white text-gray-600`}>Self-reported</span>
          {sharedCount === 0 ? (
            <span className={`${badgeBase} border-stone-200 bg-white text-gray-600`}>
              <Lock className="h-3 w-3" aria-hidden="true" />
              Only me
            </span>
          ) : (
            <span className={`${badgeBase} border-[#BCE1D1] bg-[#E5F0EB] text-[#0A3D31]`}>
              <Share2 className="h-3 w-3" aria-hidden="true" />
              Shared with {sharedCount} {sharedCount === 1 ? "agency" : "agencies"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {confirmingArchive ? (
          <div role="alertdialog" aria-label={`Archive ${c.name}?`} className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-gray-700">Archive this credential? Agencies will no longer see it.</span>
            <button type="button" onClick={archive} disabled={archiving} className="rounded-full bg-[#0B3B32] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#082a23] disabled:opacity-60">
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

      <CredentialFileUpload />

      <CredentialSharing credentialId={c.id} shares={c.shares} agencies={agencies} onSharesChange={onSharesChange} />
    </li>
  );
};
