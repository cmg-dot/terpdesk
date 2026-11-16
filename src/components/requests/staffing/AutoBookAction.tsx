"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { autoBookInterpreter } from "@/app/actions/autoBookInterpreter";
import type { DirectAssignSuccess } from "@/components/requests/DirectAssignPanel";
import type { JobPosition } from "@/lib/validation/directAssign";

interface Props {
  jobId: string;
  positionIndex: JobPosition;
  interpreterId: string;
  interpreterName: string;
  /** The picked interpreter is free for the job (the server checks again). */
  available: boolean;
  onBooked: (result: DirectAssignSuccess) => void | Promise<void>;
}

/**
 * Under "Select one recipient", when the picked interpreter allows this agency to auto-book them: one click books them now through
 * the same core as Directly assign. The server re-checks the permission, that the job is virtual, and that it fits their availability.
 */
export function AutoBookAction({ jobId, positionIndex, interpreterId, interpreterName, available, onBooked }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const book = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await autoBookInterpreter({ jobId, interpreterId, positionIndex });
      if (result.success) await onBooked(result);
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" data-auto-book="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Auto-book on: {interpreterName} allows your agency to book them directly (virtual jobs inside their availability).
        </span>
        <button
          type="button"
          onClick={book}
          disabled={busy || !available}
          title={available ? undefined : "Not free for this job: send an offer instead."}
          className="rounded-full bg-[var(--forest)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-50"
        >
          {busy ? "Booking…" : `Auto-book ${interpreterName}`}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
