"use client";

import { memo } from "react";
import { CalendarDayCard } from "@/components/calendar/CalendarDayCard";
import { orderForDisplay } from "@/lib/calendarDayIndex";
import type { DayCard, DayPhases } from "@/lib/calendarDayIndex";

interface Props {
  /** yyyy-MM-dd, or null for the empty cells that pad the first and last week. */
  dayKey: string | null;
  isToday: boolean;
  isSelected: boolean;
  cards: readonly DayCard[];
  phases: DayPhases;
}

const sameCards = (a: readonly DayCard[], b: readonly DayCard[]): boolean => a === b || (a.length === b.length && a.every((card, i) => card === b[i]));

/** One day of the month grid. Memoized on its own day: stepping months or the minute clock repaints only the cells that changed. */
export const MonthCell = memo(
  function MonthCell({ dayKey, isToday, isSelected, cards, phases }: Props) {
    if (!dayKey) return <div className="min-h-[120px] border-r border-b border-gray-200 bg-[#F9F8F4]" />;
    const shade = isToday ? "bg-[#F1F8F4]" : "bg-white hover:bg-[#F7FAF8]";
    return (
      <div
        className={`min-h-[120px] border-r border-b border-gray-200 p-2 flex flex-col transition-colors duration-100 ${shade} ${isSelected ? "ring-2 ring-inset ring-[#0B3B32]/35" : ""}`}
        data-today={isToday ? "true" : undefined}
        data-date={dayKey}
        data-selected={isSelected ? "true" : undefined}
      >
        <div className={`mb-1 w-fit text-sm font-medium px-1 ${isToday ? "rounded-full bg-[#0B3B32] px-2 text-white" : "text-[var(--ink)]"}`}>{Number(dayKey.slice(8))}</div>
        <div className="flex-1 overflow-y-auto space-y-1 max-h-[160px]">
          {orderForDisplay(cards, phases).map(({ card, phase }) => (
            <CalendarDayCard key={card.request.id} card={card} phase={phase} variant="month" />
          ))}
        </div>
      </div>
    );
  },
  (a, b) => a.dayKey === b.dayKey && a.isToday === b.isToday && a.isSelected === b.isSelected && a.phases === b.phases && sameCards(a.cards, b.cards),
);
