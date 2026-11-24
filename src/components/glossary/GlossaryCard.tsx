"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { GlossaryForm } from "@/components/glossary/GlossaryForm";
import { Reveal } from "@/components/myWork/Reveal";
import { glossaryFormValues, pairLabel } from "@/lib/glossary";
import type { GlossaryTermView } from "@/lib/glossary";

interface GlossaryCardProps {
  term: GlossaryTermView;
  /** True while this card shows its edit form (it opens inside the card, so the list is never left). */
  editing?: boolean;
  onEdit: (term: GlossaryTermView) => void;
  onSaved: (term: GlossaryTermView) => void;
  onCancelEdit: () => void;
  /** Resolves to an error message, or null when it was deleted. */
  onDelete: (term: GlossaryTermView) => Promise<string | null>;
}

const CHIP = "inline-flex max-w-full items-center rounded-full border border-[var(--banner-edge)] bg-[var(--canvas)] px-2.5 py-0.5 text-[12px] text-[var(--sage)]";
const BUTTON = "min-h-11 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:opacity-50 sm:min-h-9";

/**
 * One glossary term in the style of a My work card: the source term as the title, the target rendering under it, the pills (language
 * pair, setting), the context note, and Edit with a two-step Delete. Edit opens the form below the summary, inside the card.
 */
export function GlossaryCard({ term, editing = false, onEdit, onSaved, onCancelEdit, onDelete }: GlossaryCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const message = await onDelete(term);
    if (message) {
      setError(message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      data-glossary-term={term.id}
      data-editing={editing ? "true" : "false"}
      role="listitem"
      className="rounded-2xl border border-[var(--banner-edge)] bg-white p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[16px] font-semibold text-[var(--ink)]" data-term="">{term.term}</h3>
          <p className="mt-1 break-words text-[15px] font-medium text-[var(--forest)]" data-rendering="">{term.rendering}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--tint-ink)]">{pairLabel(term)}</span>
            {term.setting && <span className={CHIP}>{term.setting}</span>}
          </div>
          {term.note && <p className="mt-2 break-words text-[13px] leading-relaxed text-[var(--sage)]" data-note="">{term.note}</p>}
        </div>

        {!editing && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <span className="text-[13px] text-[var(--sage)]">Delete this term?</span>
                <button type="button" onClick={remove} disabled={deleting} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className={`${BUTTON} border border-[var(--banner-edge)] text-[var(--ink)] hover:bg-[var(--surface)]`}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onEdit(term)} className={`${BUTTON} border border-[var(--forest)] text-[var(--forest)] hover:bg-[var(--forest)] hover:text-[var(--canvas)]`}>
                  Edit
                </button>
                <button type="button" onClick={() => setConfirming(true)} className={`${BUTTON} border border-[var(--banner-edge)] text-red-700 hover:bg-red-50`}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <Reveal key="edit">
            <div className="mt-4 border-t border-[var(--banner-edge)] pt-4">
              <GlossaryForm embedded idPrefix={`gl-edit-${term.id}`} editingId={term.id} initial={glossaryFormValues(term)} onSaved={onSaved} onCancel={onCancelEdit} />
            </div>
          </Reveal>
        )}
      </AnimatePresence>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
