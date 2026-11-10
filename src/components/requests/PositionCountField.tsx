"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_POSITIONS, MIN_POSITIONS } from "@/lib/positions";

interface Props {
  /** How many interpreter positions the job has. */
  value: number;
  onChange: (next: number) => void;
  /** Locked (for example while someone is booked): the number is shown but the buttons do nothing. */
  disabled?: boolean;
  /** Why it is locked, shown under the control. */
  disabledReason?: string;
  min?: number;
  max?: number;
}

const buttonClass =
  "flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-[var(--ink)] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";

/**
 * "How many interpreters?" as a small stepper from 1 to 10, for the new and edit request forms. Each position is then filled
 * separately in Staffing on the request page; saving the form books nobody.
 */
export function PositionCountField({ value, onChange, disabled = false, disabledReason, min = MIN_POSITIONS, max = MAX_POSITIONS }: Props) {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  return (
    <div data-position-count>
      <div role="group" aria-label="Number of interpreter positions" className="inline-flex items-center gap-3">
        <button type="button" aria-label="One fewer interpreter" data-position-minus className={buttonClass} disabled={disabled || clamped <= min} onClick={() => onChange(clamped - 1)}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <output aria-live="polite" data-position-value className="min-w-[7.5rem] text-center text-[15px] font-medium text-[var(--ink)]">
          {clamped} {clamped === 1 ? "interpreter" : "interpreters"}
        </output>
        <button type="button" aria-label="One more interpreter" data-position-plus className={buttonClass} disabled={disabled || clamped >= max} onClick={() => onChange(clamped + 1)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {disabled && disabledReason && <p className="mt-2 text-xs font-medium text-amber-700">{disabledReason}</p>}
      {!disabled && clamped >= max && <p className="mt-2 text-xs text-[var(--sage)]">A job can have at most {max} interpreter positions.</p>}
    </div>
  );
}
