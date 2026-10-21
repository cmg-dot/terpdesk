"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { resendBookingDetails } from "@/app/actions/bookingDetails";

/** "Resend details" on a booked slot: emails the interpreter their booking confirmation (with the secure link) again. */
export function ResendDetailsButton({ requestId, positionIndex }: { requestId: string; positionIndex: 1 | 2 }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await resendBookingDetails({ requestId, positionIndex });
      setResult(res.success ? { ok: true, text: res.message } : { ok: false, text: res.error });
    } catch {
      setResult({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sage)] transition-colors hover:text-[var(--ink)] disabled:opacity-60"
      >
        <Send className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? "Sending…" : "Resend details"}
      </button>
      {result && (
        <span role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.text}
        </span>
      )}
    </span>
  );
}
