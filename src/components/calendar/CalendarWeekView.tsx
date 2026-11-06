"use client";

import { memo } from "react";
import { CalendarDayCard } from "@/components/calendar/CalendarDayCard";
import { useDayPhases } from "@/hooks/useDayIndex";
import { NO_CARDS, highlightIn, orderForDisplay } from "@/lib/calendarDayIndex";
import type { DayCard, DayIndex, DayPhases } from "@/lib/calendarDayIndex";
import { weekKeys } from "@/lib/calendarNav";
import { formatDateLabel } from "@/lib/dateTimePicker";

interface Props {
  /** Any day of the week to show, yyyy-MM-dd. */
  dateKey: string;
  todayKey: string;
  index: DayIndex;
  nowMs: number;
  highlightId: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WeekColumn = memo(function WeekColumn({ cards, phases, isToday, highlightId }: { cards: readonly DayCard[]; phases: DayPhases; isToday: boolean; highlightId: string | null }) {
  return (
    <div className={`border-r border-gray-100 last:border-r-0 p-2 flex flex-col gap-2 transition-colors duration-100 ${isToday ? "bg-[#F1F8F4]" : "bg-[#FAFAFA]/50 hover:bg-[#F7FAF8]"}`}>
      {cards.length === 0 ? (
        <div className="text-[11px] text-gray-400 text-center py-6">No bookings</div>
      ) : (
        orderForDisplay(cards, phases).map(({ card, phase }) => <CalendarDayCard key={card.request.id} card={card} phase={phase} variant="week" highlighted={card.request.id === highlightId} />)
      )}
    </div>
  );
});

/** The seven-day week. Each column is one key lookup in the day index. */
export const CalendarWeekView = ({ dateKey, todayKey, index, nowMs, highlightId }: Props) => {
  const days = weekKeys(dateKey);
  const phases = useDayPhases(days, index, nowMs);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 overflow-hidden" data-calendar-view="week">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {days.map((key, i) => (
              <div key={key} data-today={key === todayKey ? "true" : undefined} className={`text-center py-3 border-r border-gray-100 last:border-r-0 ${key === todayKey ? "bg-[#E5F0EB]" : ""}`}>
                <div className="text-[12px] font-semibold text-[var(--ink)] uppercase tracking-wider">{WEEKDAYS[i]}</div>
                <div className="text-sm font-semibold text-gray-700 mt-0.5">{formatDateLabel(key).replace(/, \d{4}$/, "")}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 min-h-[500px]">
            {days.map((key) => (
              <WeekColumn key={key} cards={index.get(key) ?? NO_CARDS} phases={phases.get(key) ?? ""} isToday={key === todayKey} highlightId={highlightIn(index.get(key) ?? NO_CARDS, highlightId)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
