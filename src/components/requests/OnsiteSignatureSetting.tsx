"use client";

import { useState } from "react";
import { setOnsiteSignatureRequired } from "@/app/actions/onsiteSignatureSetting";
import { OnsiteSignatureToggle } from "@/components/requests/OnsiteSignatureToggle";

interface Props {
  requestId: string;
  required: boolean;
  /** Hours are already on the job: the setting is frozen. */
  locked: boolean;
  onChanged: (next: boolean) => void;
}

/**
 * The on-site sign-off setting on the request page. The edit form is refused once a booked appointment has started, so the
 * setting saves on its own here (agency only; the server refuses it for a state job and once hours exist).
 */
export function OnsiteSignatureSetting({ requestId, required, locked, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setOnsiteSignatureRequired({ requestId, required: next });
      if (result.success) onChanged(result.required);
      else setError(result.error);
    } catch {
      setError("Could not save the setting. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 sm:px-8" data-onsite-setting>
      <h2 className="text-[16px] font-medium text-[var(--ink)] mb-3">Hours verification</h2>
      <OnsiteSignatureToggle id="request-page-onsite-signature" checked={required} disabled={locked || busy} onChange={change} />
      {locked && <p className="mt-2 text-xs text-gray-400">Hours have already been submitted for this job, so this setting can no longer change.</p>}
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
