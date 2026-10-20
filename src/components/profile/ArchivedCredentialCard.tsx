"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { deleteCredentialPermanently, reactivateCredential } from "@/app/actions/credentials";
import { actionButton, credentialLines, dangerButton, neutralBadge } from "@/components/profile/credentialFormat";
import type { MyCredential } from "@/lib/validation/credential";

interface ArchivedCredentialCardProps {
  credential: MyCredential;
  onReactivated: (credential: MyCredential) => void;
  onDeleted: () => void;
}

type Busy = "reactivate" | "delete" | null;

/** An archived credential: hidden from agencies, kept until the interpreter reactivates or permanently deletes it. */
export const ArchivedCredentialCard = ({ credential: c, onReactivated, onDeleted }: ArchivedCredentialCardProps) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const { details, dates } = credentialLines(c);

  const reactivate = async () => {
    if (busy) return;
    setBusy("reactivate");
    setError(null);
    try {
      const result = await reactivateCredential(c.id);
      if (result.success) onReactivated(result.credential);
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const deletePermanently = async () => {
    if (busy) return;
    setBusy("delete");
    setError(null);
    try {
      const result = await deleteCredentialPermanently(c.id);
      if (result.success) onDeleted();
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold text-gray-700">{c.name}</h3>
            <span className={neutralBadge}>{c.type}</span>
          </div>
          {details.length > 0 && <p className="text-[13px] text-gray-600">{details.join(" · ")}</p>}
          {dates.length > 0 && <p className="text-[13px] text-gray-500">{dates.join(" · ")}</p>}
        </div>
        <span className={`${neutralBadge} shrink-0 self-start`}>
          <Archive className="h-3 w-3" aria-hidden="true" />
          Archived · hidden from agencies
        </span>
      </div>

      {confirmingDelete ? (
        <div role="alertdialog" aria-label={`Permanently delete ${c.name}?`} className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-[13px] text-red-800">
            Permanently delete this credential? This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={deletePermanently}
              disabled={busy !== null}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy === "delete" ? "Deleting…" : "Yes, delete permanently"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy !== null} className={actionButton}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reactivate} disabled={busy !== null} className={actionButton}>
            {busy === "reactivate" ? "Reactivating…" : "Reactivate"}
          </button>
          <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy !== null} className={dangerButton}>
            Delete permanently
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </li>
  );
};
