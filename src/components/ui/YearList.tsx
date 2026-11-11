"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { SCROLLBAR_CLASS } from "@/components/ui/popoverStyles";

interface Props {
  /** The year the calendar is showing (highlighted, and scrolled into view). */
  selectedYear: number;
  minYear: number;
  maxYear: number;
  onPick: (year: number) => void;
  /** Back to the month view without choosing. */
  onBack: () => void;
}

/**
 * The calendar's "choose a year" view, for dates a long way from today (a birth date): the years from the latest down to the earliest in a
 * scrolling grid, so a year is two clicks, not forty month-arrows. Same cream/emerald look as the calendar it replaces while it is open.
 * Escape goes back to the month view (and does not close the popup).
 */
export const YearList = ({ selectedYear, minYear, maxYear, onPick, onBack }: Props) => {
  const list = useRef<HTMLDivElement>(null);
  const years = Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, i) => maxYear - i);

  // Open with the current year in the middle of the list and focused (the page itself is not scrolled).
  useEffect(() => {
    const box = list.current;
    const current = box?.querySelector<HTMLElement>(`[data-year="${selectedYear}"]`);
    if (box && current) box.scrollTop = Math.max(0, current.offsetTop - box.clientHeight / 2 + current.clientHeight / 2);
    (current ?? box?.querySelector<HTMLElement>("[data-year]"))?.focus({ preventScroll: true });
  }, [selectedYear]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  };

  return (
    <div className="w-[19rem] max-w-full select-none" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-[var(--forest)] transition-colors hover:bg-[var(--mint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Choose a year
      </button>
      <div ref={list} role="group" aria-label="Years" data-year-list className={`relative grid max-h-60 grid-cols-4 gap-1 overflow-y-auto overscroll-contain pr-1 ${SCROLLBAR_CLASS}`}>
        {years.map((year) => (
          <button
            key={year}
            type="button"
            data-year={year}
            aria-pressed={year === selectedYear}
            onClick={() => onPick(year)}
            className={`rounded-full py-1.5 text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] ${
              year === selectedYear ? "bg-[var(--forest)] font-semibold text-white" : "text-slate-800 hover:bg-[var(--mint)] hover:text-[var(--forest)]"
            }`}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
};
