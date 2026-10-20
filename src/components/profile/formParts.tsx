import type { ReactNode } from "react";

/** Off-white fill so inputs stand out on the white cards; a dark green border and ring show focus. */
export const inputClass =
  "w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/40 aria-[invalid=true]:border-red-400";

/** A label, one control, and its hint or error. `id` must match the control's id. */
export const Field = ({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`space-y-1.5 ${className}`}>
    <label htmlFor={id} className="block text-[13px] font-medium text-gray-700">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-[12px] text-red-700">
        {error}
      </p>
    ) : (
      hint && <p className="text-[12px] text-gray-500">{hint}</p>
    )}
  </div>
);

/** A white card with a heading and a 2-column grid on desktop (1 column on mobile). */
export const FormCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="rounded-2xl border border-gray-200 bg-white p-6">
    <legend className="sr-only">{title}</legend>
    <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">{title}</h2>
    <div className="grid gap-4 md:grid-cols-2">{children}</div>
  </fieldset>
);
