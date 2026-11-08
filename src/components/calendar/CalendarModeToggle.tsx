"use client";

export type CalendarMode = "jobs" | "interpreters";

const OPTIONS: { id: CalendarMode; label: string }[] = [
  { id: "jobs", label: "Job View" },
  { id: "interpreters", label: "Interpreter View" },
];

/** Switches the agency calendar between the original Job View and the Interpreter View (one row per interpreter). */
export const CalendarModeToggle = ({ mode, onChange }: { mode: CalendarMode; onChange: (mode: CalendarMode) => void }) => (
  <div role="group" aria-label="Calendar view" className="flex w-full flex-col gap-1 rounded-2xl border border-gray-200 bg-white p-1 sm:inline-flex sm:w-auto sm:flex-row sm:rounded-full">
    {OPTIONS.map((option) => (
      <button
        key={option.id}
        type="button"
        aria-pressed={mode === option.id}
        onClick={() => onChange(option.id)}
        className={`w-full rounded-xl px-5 py-2 text-center text-sm font-medium transition-colors sm:w-auto sm:rounded-full ${
          mode === option.id ? "bg-[var(--forest)] text-white" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
