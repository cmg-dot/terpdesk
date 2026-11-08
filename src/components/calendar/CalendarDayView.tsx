"use client";

import { CalendarDayCard } from "@/components/calendar/CalendarDayCard";
import { useDayPhases } from "@/hooks/useDayIndex";
import { NO_CARDS, orderForDisplay } from "@/lib/calendarDayIndex";
import type { DayIndex } from "@/lib/calendarDayIndex";
import { formatDateSpoken } from "@/lib/dateTimePicker";

interface Props {
  dateKey: string;
  todayKey: string;
  index: DayIndex;
  nowMs: number;
  highlightId: string | null;
}

/** One day: its appointments in order, live ones first. */
export const CalendarDayView = ({ dateKey, todayKey, index, nowMs, highlightId }: Props) => {
  const cards = index.get(dateKey) ?? NO_CARDS;
  const phases = useDayPhases([dateKey], index, nowMs).get(dateKey) ?? "";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 min-h-[400px]" data-calendar-view="day">
      <div className="flex items-center justify-between mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--ink)]">
          {formatDateSpoken(dateKey)}
          {dateKey === todayKey && <span data-today-chip className="rounded-full bg-[var(--forest)] px-2.5 py-0.5 text-xs font-medium text-white">Today</span>}
        </h2>
        <span className="text-sm text-[var(--sage)]">
          {cards.length} {cards.length === 1 ? "appointment" : "appointments"}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed border-gray-200 rounded-xl">
          <p className="text-[var(--sage)]">Nothing scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orderForDisplay(cards, phases).map(({ card, phase }) => (
            <CalendarDayCard key={card.request.id} card={card} phase={phase} variant="day" highlighted={card.request.id === highlightId} />
          ))}
        </div>
      )}
    </div>
  );
};
