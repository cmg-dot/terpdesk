"use client";

import { useState } from "react";
import { runDecline } from "@/lib/declineFlow";

const BUTTON = "inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11";

interface ViewProps {
  confirming: boolean;
  busy: boolean;
  error: string | null;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The Decline control on a Home offer card, drawn from its state (so it can be shown in either step without a browser): the
 * "Decline" button, or the inline question "Decline this offer?" with "Yes, decline" and "Cancel". No reason box on purpose.
 */
export function OfferDeclineView({ confirming, busy, error, onAsk, onConfirm, onCancel }: ViewProps) {
  if (!confirming) {
    return (
      <button type="button" onClick={onAsk} data-offer-decline="" className={`${BUTTON} border border-red-200 bg-white text-[#9B1C1C] hover:bg-red-50`}>
        Decline
      </button>
    );
  }
  return (
    <div role="group" aria-label="Confirm declining this offer" data-offer-decline-confirm="" className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2">
      <span className="text-[13px] font-medium text-[var(--ink)]">Decline this offer?</span>
      <button type="button" onClick={onConfirm} disabled={busy} className={`${BUTTON} bg-[#9B1C1C] text-white hover:bg-[#7F1717]`}>
        {busy ? "Declining..." : "Yes, decline"}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className={`${BUTTON} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
        Cancel
      </button>
      {error && <p role="alert" className="w-full text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

/** Declining one offer: asks first, then calls `onDecline` (the context's declineOffer), which tells the agency and closes the offer. */
export function OfferDeclineControl({ offerId, onDecline }: { offerId: string; onDecline: (offerId: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await runDecline(onDecline, offerId);
    // On success the card leaves the list; on a refusal it stays, with the server's words.
    if (!result.ok) setError(result.error);
    setBusy(false);
  };

  return (
    <OfferDeclineView
      confirming={confirming}
      busy={busy}
      error={error}
      onAsk={() => { setError(null); setConfirming(true); }}
      onConfirm={() => void confirm()}
      onCancel={() => { setError(null); setConfirming(false); }}
    />
  );
}
