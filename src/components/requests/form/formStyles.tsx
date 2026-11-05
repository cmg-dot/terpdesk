import type { ReactNode } from "react";

/** The request forms' field wrapper and look, for the form pieces that live outside the two page files. */
export const inputClass =
  "w-full bg-[#F4F3EF] border-none rounded-full px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none transition-shadow appearance-none";
export const textareaClass =
  "w-full bg-[#F4F3EF] border-none rounded-2xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] resize-none outline-none transition-shadow";
export const cardClass = "bg-white rounded-2xl border border-gray-200 p-6 border border-gray-200/50 shadow-none space-y-6";
export const sectionTitleClass = "text-[18px] font-medium text-[var(--ink)] mb-4";

export function FormField({ label, subtext, htmlFor, children }: { label: string; subtext?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={htmlFor} className="block text-sm text-gray-600 mb-1.5">{label}</label>
      {children}
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
