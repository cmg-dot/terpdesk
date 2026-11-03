"use client";

import { useEffect, useRef } from "react";
import { SCROLLBAR_CLASS } from "@/components/ui/popoverStyles";
import { HOUR_CHOICES, minuteChoices, timeFromParts, toTimeParts } from "@/lib/dateTimePicker";
import type { TimeParts } from "@/lib/dateTimePicker";

interface Props {
  /** The chosen time (HH:mm), or "" for none. */
  value: string;
  onPick: (value: string) => void;
  onDone: () => void;
}

const optionClass = (selected: boolean): string =>
  `flex h-8 w-full items-center justify-center rounded-lg text-[13px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B32] ${
    selected ? "bg-[#0B3B32] font-semibold text-white" : "text-slate-800 hover:bg-emerald-50 hover:text-[#0B3B32]"
  }`;

/** Nothing chosen yet: the first click on any column starts from 9:00 AM. */
const DEFAULT_PARTS: TimeParts = { hour12: 9, minute: 0, pm: false };

/**
 * A time selector: three columns (hour, minute in 5-minute steps, AM / PM). Every click sets the time at once; "Done"
 * closes it. The chosen value is solid primary emerald and hovering gives a soft emerald wash. A minute that is not on a
 * 5-minute step (a time typed in elsewhere) is kept in the list, so opening the selector never loses it.
 */
export const TimeSelector = ({ value, onPick, onDone }: Props) => {
  const current = toTimeParts(value);
  const parts = current ?? DEFAULT_PARTS;
  const root = useRef<HTMLDivElement>(null);

  // Take focus on the chosen hour, and bring the chosen hour and minute into view in their (scrolling) columns.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>('[aria-pressed="true"]').forEach((b) => b.scrollIntoView?.({ block: "center" }));
    (el.querySelector<HTMLElement>('[data-col="hour"][aria-pressed="true"]') ?? el.querySelector<HTMLElement>('[data-col="hour"]'))?.focus({ preventScroll: true });
  }, []);

  const set = (patch: Partial<TimeParts>) => onPick(timeFromParts({ ...parts, ...patch }));
  const column = "flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain p-0.5 " + SCROLLBAR_CLASS;

  return (
    <div ref={root} className="w-[15rem] max-w-full select-none">
      <div className="mb-1 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70" aria-hidden="true">
        <span>Hour</span>
        <span>Min</span>
        <span>AM / PM</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div role="group" aria-label="Hour" className={column}>
          {HOUR_CHOICES.map((hour) => (
            <button key={hour} type="button" data-col="hour" aria-pressed={current !== null && hour === parts.hour12} onClick={() => set({ hour12: hour })} className={optionClass(current !== null && hour === parts.hour12)}>
              {hour}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Minute" className={column}>
          {minuteChoices(current ? current.minute : null).map((minute) => (
            <button key={minute} type="button" data-col="minute" aria-pressed={current !== null && minute === parts.minute} onClick={() => set({ minute })} className={optionClass(current !== null && minute === parts.minute)}>
              {String(minute).padStart(2, "0")}
            </button>
          ))}
        </div>
        <div role="group" aria-label="AM or PM" className="flex flex-col gap-0.5 p-0.5">
          {([false, true] as const).map((pm) => (
            <button key={String(pm)} type="button" data-col="period" aria-pressed={current !== null && pm === parts.pm} onClick={() => set({ pm })} className={optionClass(current !== null && pm === parts.pm)}>
              {pm ? "PM" : "AM"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-end border-t border-gray-200 pt-2">
        <button type="button" onClick={onDone} className="rounded-full bg-[#0B3B32] px-4 py-1 text-[13px] font-medium text-white hover:bg-[#082a23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B32] focus-visible:ring-offset-1">
          Done
        </button>
      </div>
    </div>
  );
};
