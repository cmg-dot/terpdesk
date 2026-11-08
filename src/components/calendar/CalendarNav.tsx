"use client";

import type { ReactNode } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { PickerField } from "@/components/ui/PickerField";
import { formatBadgeDate } from "@/lib/calendarNav";
import type { CalendarView } from "@/lib/calendarNav";

interface Props {
  /** The selected day and today, both yyyy-MM-dd in the calendar's own zone. */
  dateKey: string;
  todayKey: string;
  /** How far the arrows step: a month, a week or a day. */
  unit: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Called with the day picked in the popover. */
  onPick: (key: string) => void;
  /** Sits between "Today" and the next arrow (the interpreter calendar's "Block time"). */
  extra?: ReactNode;
  size?: "md" | "sm";
}

const SIZES = {
  md: { arrow: "h-10 w-10", arrowIcon: "h-5 w-5", today: "px-5 py-2 text-sm", badge: "text-sm" },
  sm: { arrow: "h-9 w-9", arrowIcon: "h-4 w-4", today: "px-4 py-2 text-[13px]", badge: "text-[13px]" },
} as const;

/**
 * Previous / Today / Next and the date badge. The badge is a button: it opens a calendar popover to jump straight to any
 * day, month or year, and its "Today" is the calendar's own today (Los Angeles for the agency), not the browser's.
 */
export const CalendarNav = ({ dateKey, todayKey, unit, onPrev, onNext, onToday, onPick, extra, size = "md" }: Props) => {
  const s = SIZES[size];
  const arrow = `flex ${s.arrow} items-center justify-center rounded-full border border-gray-200 text-gray-700 transition-colors duration-100 hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)]`;
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} aria-label={`Previous ${unit}`} className={arrow}>
          <ChevronLeft className={s.arrowIcon} aria-hidden="true" />
        </button>
        <button type="button" onClick={onToday} className={`rounded-full border border-gray-200 font-medium text-gray-700 transition-colors duration-100 hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] ${s.today}`}>
          Today
        </button>
        {extra}
        <button type="button" onClick={onNext} aria-label={`Next ${unit}`} className={arrow}>
          <ChevronRight className={s.arrowIcon} aria-hidden="true" />
        </button>
      </div>
      <div>
        <PickerField
          popoverLabel="Jump to a date"
          text={formatBadgeDate(dateKey)}
          placeholder="Choose a date"
          icon={<CalendarIcon aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />}
          className={`rounded-full bg-[#F4F3EF] py-2 pr-4 font-medium tabular-nums text-gray-700 transition-colors duration-100 hover:bg-[#E9E7DF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] ${s.badge}`}
          wrapperClassName="relative w-fit"
          compact={false}
          ariaLabel="Jump to a date"
          spring
          align="end"
          edge={16}
        >
          {(close) => (
            <CalendarGrid
              value={dateKey}
              today={todayKey}
              onPick={(key) => {
                onPick(key);
                close();
              }}
              onDone={close}
            />
          )}
        </PickerField>
      </div>
    </div>
  );
};
