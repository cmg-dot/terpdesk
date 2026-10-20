"use client";

import { useState } from "react";
import { Award, Plus } from "lucide-react";
import { deleteCredential } from "@/app/actions/credentials";
import { CredentialForm } from "@/components/profile/CredentialForm";
import type { MyCredential } from "@/lib/validation/credential";

interface CredentialsTabProps {
  credentials: MyCredential[];
  onChange: (credentials: MyCredential[]) => void;
}

const EXPIRING_SOON_DAYS = 60;

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
  if (days < 0) return { label: "Expired", className: "bg-red-50 text-red-700 border-red-200" };
  if (days <= EXPIRING_SOON_DAYS) return { label: "Expires soon", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return null;
};

/** "My Profile" Credentials tab: what the interpreter holds (certifications, insurance, training...). */
export const CredentialsTab = ({ credentials, onChange }: CredentialsTabProps) => {
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const result = await deleteCredential(id);
      if (result.success) {
        onChange(credentials.filter((c) => c.id !== id));
        setConfirmingId(null);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (adding) {
    return (
      <CredentialForm
        onCancel={() => setAdding(false)}
        onAdded={(created) => {
          onChange([...credentials, created].sort((a, b) => a.name.localeCompare(b.name)));
          setAdding(false);
        }}
      />
    );
  }

  const addButton = (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="inline-flex items-center gap-2 rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#082a23]"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add a credential
    </button>
  );

  if (credentials.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <Award className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[var(--ink)]">Nothing listed yet</h2>
        <p className="mx-auto mb-6 mt-1 max-w-md text-sm text-[var(--sage)]">
          Add your certifications, qualifications, training and insurance so agencies know what you hold.
        </p>
        {addButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addButton}</div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <ul className="space-y-3">
        {credentials.map((c) => {
          const status = expiryStatus(c.expirationDate);
          const details = [c.issuedBy && `Issued by ${c.issuedBy}`, c.credentialNumber && `No. ${c.credentialNumber}`].filter(Boolean);
          const dates = [c.issueDate && `Issued ${formatDay(c.issueDate)}`, c.expirationDate && `Expires ${formatDay(c.expirationDate)}`].filter(Boolean);
          return (
            <li key={c.id} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-[var(--ink)]">{c.name}</h3>
                    <span className="rounded-full border border-gray-200 bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">{c.type}</span>
                    {status && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
                    )}
                  </div>
                  {details.length > 0 && <p className="text-[13px] text-gray-600">{details.join(" · ")}</p>}
                  {dates.length > 0 && <p className="text-[13px] text-gray-500">{dates.join(" · ")}</p>}
                  {c.notes && <p className="whitespace-pre-line pt-1 text-[13px] text-gray-600">{c.notes}</p>}
                </div>

                {confirmingId === c.id ? (
                  <div className="flex shrink-0 items-center gap-2" role="alertdialog" aria-label={`Delete ${c.name}?`}>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={busyId !== null}
                      className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {busyId === c.id ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busyId !== null}
                      className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(c.id)}
                    className="shrink-0 self-start rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
