"use client";

import { useState } from "react";
import { setCredentialShare } from "@/app/actions/credentialShares";
import type { CredentialShare } from "@/lib/validation/credential";

interface CredentialSharingProps {
  credentialId: string;
  shares: CredentialShare[];
  /** Agencies the interpreter is connected to, with display names. */
  agencies: { id: string; name: string }[];
  onSharesChange: (shares: CredentialShare[]) => void;
}

const checkboxClass = "h-4 w-4 rounded border-gray-300 accent-[#0B3B32]";

/**
 * "Who can see this credential": one checkbox per connected agency, plus "Include supporting files" once shared.
 * Changes show at once (so the card's badge updates immediately) and are undone if the server refuses them.
 */
export const CredentialSharing = ({ credentialId, shares, agencies, onSharesChange }: CredentialSharingProps) => {
  const [busyAgencyId, setBusyAgencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (agencyId: string, shared: boolean, includeFiles: boolean) => {
    if (busyAgencyId) return;
    const previous = shares;
    const optimistic = shared
      ? [...shares.filter((s) => s.agencyId !== agencyId), { agencyId, includeFiles }]
      : shares.filter((s) => s.agencyId !== agencyId);
    onSharesChange(optimistic);
    setBusyAgencyId(agencyId);
    setError(null);
    try {
      const result = await setCredentialShare({ credentialId, agencyId, shared, includeFiles });
      if (result.success) {
        onSharesChange(result.shares);
      } else {
        onSharesChange(previous);
        setError(result.error);
      }
    } catch {
      onSharesChange(previous);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyAgencyId(null);
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[13px] font-semibold text-[var(--ink)]">Who can see this credential</h4>

      {agencies.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-3 text-[13px] text-gray-600">
          You are not connected to any agencies yet. Join an agency from the Agencies tab to share your credentials.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl bg-white px-4">
          {agencies.map((agency) => {
            const share = shares.find((s) => s.agencyId === agency.id);
            const busy = busyAgencyId === agency.id;
            return (
              <li key={agency.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2.5 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={Boolean(share)}
                    disabled={busy}
                    onChange={(e) => update(agency.id, e.target.checked, false)}
                    className={checkboxClass}
                  />
                  {agency.name}
                </label>
                {share && (
                  <label className="inline-flex items-center gap-2.5 pl-6 text-[13px] text-gray-600 sm:pl-0">
                    <input
                      type="checkbox"
                      checked={share.includeFiles}
                      disabled={busy}
                      onChange={(e) => update(agency.id, true, e.target.checked)}
                      className={checkboxClass}
                    />
                    Include supporting files
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
