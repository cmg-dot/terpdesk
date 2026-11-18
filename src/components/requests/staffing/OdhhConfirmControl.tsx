"use client";

import { useState } from "react";
import { setOdhhConfirmed } from "@/app/actions/odhhConfirmation";
import { OdhhPortalReminder } from "@/components/requests/OdhhPortalReminder";

/**
 * Staffing on a state job with someone booked: the reminder to confirm the booking on the ODHH portal, with "Mark Confirmed in
 * ODHH" (and Undo) saving that it was done. Marking it collapses the interpreters' acceptance callouts to chips.
 */
export function OdhhConfirmControl({ requestId, srn, confirmed, onSaved }: { requestId: string; srn: string; confirmed: boolean; onSaved: (confirmed: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setOdhhConfirmed({ requestId, confirmed: next });
      if (result.success) onSaved(result.confirmed);
      else setError(result.error);
    } catch {
      setError("We could not save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <OdhhPortalReminder srn={srn} confirmed={confirmed} onConfirmedChange={(next) => void change(next)} busy={busy} error={error} />;
}
