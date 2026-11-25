"use client";

import { useState } from "react";

const BUTTON = "min-h-11 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:opacity-50 sm:min-h-9";

interface Props {
  /** The question asked before deleting, for example "Delete this entry?". */
  question: string;
  onEdit: () => void;
  /** Resolves to an error message, or null when it was deleted. */
  onDelete: () => Promise<string | null>;
  /** Extra buttons shown before Edit (for example "Log training"). */
  children?: React.ReactNode;
}

/** Edit and a two-step Delete, shared by the cycle and entry cards. Reports a refused delete under the card. */
export function CardActions({ question, onEdit, onDelete, children }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const message = await onDelete();
    if (message) {
      setError(message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-[13px] text-[var(--sage)]">{question}</span>
            <button type="button" onClick={remove} disabled={deleting} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className={`${BUTTON} border border-[var(--banner-edge)] text-[var(--ink)] hover:bg-[var(--surface)]`}>
              Keep
            </button>
          </>
        ) : (
          <>
            {children}
            <button type="button" onClick={onEdit} className={`${BUTTON} border border-[var(--forest)] text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]`}>
              Edit
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={`${BUTTON} border border-[var(--banner-edge)] text-red-700 hover:bg-red-50`}>
              Delete
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
