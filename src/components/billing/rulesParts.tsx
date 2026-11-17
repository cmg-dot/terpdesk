import type { ReactNode } from "react";

/** Shared pieces of the Rates & rules forms. */

export const ruleInput =
  "w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--forest)] focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)] aria-[invalid=true]:border-red-400 disabled:opacity-60";

export const primaryButton =
  "rounded-full bg-[var(--forest)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:cursor-not-allowed disabled:opacity-60";

export const quietButton = "rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";

export const RuleCard = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-6">
    <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
    {note && <p className="mb-4 mt-1 text-[13px] text-[var(--sage)]">{note}</p>}
    {!note && <div className="mb-4" />}
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
