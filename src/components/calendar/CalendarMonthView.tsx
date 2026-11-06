"use client";

import { MonthCell } from "@/components/calendar/MonthCell";
import { useDayPhases } from "@/hooks/useDayIndex";
import { NO_CARDS, highlightIn } from "@/lib/calendarDayIndex";
import type { DayIndex } from "@/lib/calendarDayIndex";
import { monthCells } from "@/lib/calendarNav";

interface Props {
  /** Any day of the month to show, yyyy-MM-dd. */
  dateKey: string;
  todayKey: string;
  index: DayIndex;
  nowMs: number;
  highlightId: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The month grid. Each cell is one key lookup in the day index. */
export const CalendarMonthView = ({ dateKey, todayKey, index, nowMs, highlightId }: Props) => {
  const cells = monthCells(dateKey);
  const phases = useDayPhases(cells, index, nowMs);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 overflow-hidden" data-calendar-view="month">
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center text-xs font-semibold text-[var(--sage)] uppercase tracking-wider py-2">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-t border-l border-gray-200">
            {cells.map((key, i) => (
              <MonthCell
                key={key ?? `pad-${i}`}
                dayKey={key}
                isToday={key === todayKey}
                isSelected={key === dateKey}
                cards={(key && index.get(key)) || NO_CARDS}
                phases={(key && phases.get(key)) || ""}
                highlightId={highlightIn((key && index.get(key)) || NO_CARDS, highlightId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
