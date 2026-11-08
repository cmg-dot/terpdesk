"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { WEEKDAY_LABELS, formatDateSpoken, monthGrid, monthLabel, parseDateKey, shiftDay, shiftMonth, todayKey } from "@/lib/dateTimePicker";

interface Props {
  /** The chosen day (yyyy-MM-dd), or "" for none. */
  value: string;
  /** Days before this (yyyy-MM-dd) cannot be picked. */
  min?: string;
  /** Days after this (yyyy-MM-dd) cannot be picked. */
  max?: string;
  /** Today (yyyy-MM-dd) when it is not this device's today, e.g. the agency calendar's Los Angeles day. */
  today?: string;
  onPick: (key: string) => void;
  onDone: () => void;
}

const navButton = "rounded-full p-1.5 text-[var(--forest)] transition-colors hover:bg-[var(--mint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)]";

/**
 * A month calendar: previous / next month and year, the days of six weeks, "Today" and "Done". The chosen day is solid
 * primary emerald, today is ringed, and hovering a day gives it a soft emerald wash. Keyboard: arrows move by a day or a
 * week, PageUp / PageDown by a month (Shift for a year), Home / End to the start / end of the week, Enter picks.
 */
export const CalendarGrid = ({ value, min, max, today: todayOverride, onPick, onDone }: Props) => {
  const today = todayOverride ?? todayKey();
  const start = parseDateKey(value) ? value : today;
  // The day the keyboard is on (the only tab stop in the grid); the grid shows the month that contains it.
  const [focusKey, setFocusKey] = useState(start);
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const shown = parseDateKey(focusKey) ?? parseDateKey(today)!;
  const cells = monthGrid(shown.year, shown.month);
  const outOfRange = (key: string): boolean => (min !== undefined && min !== "" && key < min) || (max !== undefined && max !== "" && key > max);

  // Take focus when the calendar opens, and follow the keyboard from day to day.
  useEffect(() => {
    if (moveFocus.current) grid.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus();
  }, [focusKey]);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, []);

  const go = (key: string) => {
    moveFocus.current = true;
    setFocusKey(key);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, string> = {
      ArrowLeft: shiftDay(focusKey, -1),
      ArrowRight: shiftDay(focusKey, 1),
      ArrowUp: shiftDay(focusKey, -7),
      ArrowDown: shiftDay(focusKey, 7),
      PageUp: shiftMonth(focusKey, event.shiftKey ? -12 : -1),
      PageDown: shiftMonth(focusKey, event.shiftKey ? 12 : 1),
      Home: shiftDay(focusKey, -(new Date(`${focusKey}T00:00:00Z`).getUTCDay())),
      End: shiftDay(focusKey, 6 - new Date(`${focusKey}T00:00:00Z`).getUTCDay()),
    };
    if (event.key in steps) {
      event.preventDefault();
      go(steps[event.key]);
    }
  };
  // Moving by month / year with the buttons keeps the focus on the same day of the new month (and the grid does not steal focus).
  const jump = (months: number) => {
    moveFocus.current = false;
    setFocusKey((key) => shiftMonth(key, months));
  };

  return (
    <div className="w-[19rem] max-w-full select-none">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex">
          <button type="button" className={navButton} onClick={() => jump(-12)} aria-label="Previous year"><ChevronsLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={navButton} onClick={() => jump(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <p className="text-sm font-semibold tracking-tight text-[var(--forest)]" aria-live="polite">{monthLabel(shown.year, shown.month)}</p>
        <div className="flex">
          <button type="button" className={navButton} onClick={() => jump(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={navButton} onClick={() => jump(12)} aria-label="Next year"><ChevronsRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      <div ref={grid} role="group" aria-label={monthLabel(shown.year, shown.month)} onKeyDown={onKeyDown}>
        <div aria-hidden="true" className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--mint-ink-rgb)/0.7)]">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1">{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell) => {
            const selected = cell.key === value;
            const disabled = outOfRange(cell.key);
            return (
              <button
                key={cell.key}
                type="button"
                data-day={cell.key}
                tabIndex={cell.key === focusKey ? 0 : -1}
                disabled={disabled}
                aria-pressed={selected}
                aria-current={cell.key === today ? "date" : undefined}
                aria-label={formatDateSpoken(cell.key)}
                onClick={() => onPick(cell.key)}
                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-35 ${
                  selected
                    ? "bg-[var(--forest)] font-semibold text-white"
                    : `${cell.inMonth ? "text-slate-800" : "text-gray-400"} hover:bg-[var(--mint)] hover:text-[var(--forest)] ${cell.key === today ? "ring-1 ring-[var(--forest)]" : ""}`
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
        <button
          type="button"
          disabled={outOfRange(today)}
          onClick={() => onPick(today)}
          className="rounded-full px-3 py-1 text-[13px] font-medium text-[var(--forest)] hover:bg-[var(--mint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Today
        </button>
        <button type="button" onClick={onDone} className="rounded-full bg-[var(--forest)] px-4 py-1 text-[13px] font-medium text-white hover:bg-[var(--forest-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-1">
          Done
        </button>
      </div>
    </div>
  );
};
