"use client";

import { useState } from "react";
import { confirmCancellationRequest, dismissCancellationRequest } from "@/app/actions/requesterCancel";
import type { CancelRequestFlag } from "@/lib/cancelRequestFlag";

interface Props {
  requestId: string;
  flag: CancelRequestFlag;
  isStateJob: boolean;
  /** Called after a confirm or a dismiss went through, so the page reloads the job. */
  onResolved: () => void | Promise<void>;
}

/**
 * Shown on a job a requester asked to cancel BY EMAIL. Nothing was cancelled: a dispatcher decides, because the requester often has
 * to cancel in the state's portal as well and an accidental drop is worse than a short wait. "Confirm Cancellation" cancels it as a
 * client request through the same close-out as the Cancel button; "Dismiss" says the email did not mean a cancellation. Agency only.
 * The snippet is plain text from an email, shown escaped and quoted, and never logged.
 */
export function RequesterCancelBanner({ requestId, flag, isStateJob, onResolved }: Props) {
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "confirm" | "dismiss") => {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      const result = await (which === "confirm" ? confirmCancellationRequest({ requestId }) : dismissCancellationRequest({ requestId }));
      if (result.success) await onResolved();
      else setError(result.error);
    } catch {
      setError("We could not do that. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="alert" data-cancel-request-banner className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
      <p className="font-semibold">
        Requester requested cancellation via email{flag.snippet ? <>: &ldquo;{flag.snippet}&rdquo;</> : "."}
      </p>
      <p className="mt-1 text-amber-900">
        {flag.senderMatches ? "The sender matches the requester on this job." : "The sender does not match the requester on this job: check the email in the Inbox before confirming."}
        {isStateJob ? " The request may also need cancelling in the state portal." : ""} Nothing has been cancelled yet.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void run("confirm")}
          disabled={busy !== null}
          className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "confirm" ? "Cancelling…" : "Confirm Cancellation"}
        </button>
        <button
          type="button"
          onClick={() => void run("dismiss")}
          disabled={busy !== null}
          className="rounded-full border border-amber-400 bg-white px-5 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700" role="status">{error}</p>}
    </div>
  );
}
