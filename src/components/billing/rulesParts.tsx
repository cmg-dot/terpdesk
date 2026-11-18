import type { ReactNode } from "react";

/** Shared pieces of the Rates & rules forms. */

/** Fields: 44px tall on a phone (a thumb), 38px beside a mouse. Placeholders keep the readable placeholder colour. */
export const ruleInput =
  "w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--forest)] focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)] aria-[invalid=true]:border-red-400 disabled:opacity-60 max-sm:py-[11px]";

/** A rate box in a table: while it is empty it is a dashed outline, so a column of unset rates does not read as a column of grey blocks. */
export const tableInput = `${ruleInput} placeholder-shown:border-dashed placeholder-shown:border-stone-300 placeholder-shown:bg-transparent`;

export const primaryButton =
  "rounded-full bg-[var(--forest)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11";

export const quietButton = "rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 max-sm:min-h-11";

/** A row's Save: a quiet outline once there is something to save, and nearly invisible until then (14 identical buttons were noise). */
export const rowSaveButton =
  "rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:border-transparent disabled:bg-transparent disabled:text-stone-400 max-sm:min-h-11";

/** A Rates & rules card: title, a note, and an optional action at the top right (e.g. "Add pay period"). `id` is its anchor in the section menu. */
export const RuleCard = ({ id, title, note, action, children }: { id?: string; title: string; note?: string; action?: ReactNode; children: ReactNode }) => (
  <section id={id} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
        {note && <p className="mt-1 text-[13px] text-[var(--sage)]">{note}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const RuleField = ({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="mt-1 text-xs text-red-700">
        {error}
      </p>
    ) : (
      hint && <p className="mt-1 text-xs text-[var(--sage)]">{hint}</p>
    )}
  </div>
);

export const SaveStatus = ({ error, saved }: { error: string | null; saved: boolean }) =>
  error ? (
    <p role="alert" className="text-sm font-medium text-red-700">
      {error}
    </p>
  ) : saved ? (
    <p role="status" className="text-sm font-medium text-emerald-700">
      Saved.
    </p>
  ) : null;
