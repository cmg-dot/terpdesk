import type { ReactNode } from "react";

/**
 * One numbered card of the public request form ("1. Requester", ...). A fieldset, so screen readers announce its title with each
 * field; the visible number and title repeat the legend and are hidden from them.
 */
export function FormSection({ step, title, description, children }: { step: number; title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-3xl border border-[var(--ev-line,#EBE8DF)] bg-white p-5 sm:p-7">
      <legend className="sr-only">{`${step}. ${title}`}</legend>
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--forest)] text-xs font-semibold text-[var(--ev-gold,#FFFFFF)]">
          {step}
        </span>
        <div>
          <p aria-hidden="true" className="text-[16px] font-semibold text-[var(--forest)]">{title}</p>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-[var(--sage)]">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}
