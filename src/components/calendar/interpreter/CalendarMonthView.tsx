import { appointmentsOnDay, busyBlocksOnDay, formatBusyBlockTimes, formatEventTimes, sortLiveFirst } from "@/lib/interpreterCalendar";
import type { CalendarAppointment, CalendarBusyBlock } from "@/lib/interpreterCalendar";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

export interface CalendarViewProps {
  /** The day being shown (a local date; its year, month and day are what count). */
  currentDate: Date;
  appointments: readonly CalendarAppointment[];
  busyBlocks: readonly CalendarBusyBlock[];
  /** The zone the calendar is drawn in. */
  zone: string;
  currentTime: number;
  onOpenJob: (id: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The month grid of the interpreter's calendar: each day lists its bookings and private busy time. */
export function CalendarMonthView({ currentDate, appointments, busyBlocks, zone, currentTime, onOpenJob }: CalendarViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1, 12, 0, 0).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0).getDate();
  const rows = Math.ceil((firstDay + daysInMonth) / 7);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-12 w-full overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center py-4 text-[12px] font-semibold text-[var(--ink)]">
              {day}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-7 min-h-[130px] border-b border-gray-200 last:border-0">
              {Array.from({ length: 7 }).map((_, colIdx) => {
                const cellIndex = rowIdx * 7 + colIdx;
                const dayNumber = cellIndex - firstDay + 1;
                const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

                if (!isCurrentMonth) {
                  return <div key={colIdx} className="p-2 border-r border-gray-200 bg-[#F5F4F0] last:border-r-0"></div>;
                }

                const dateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${dayNumber.toString().padStart(2, "0")}`;
                // Appointments and busy blocks are matched on their true date in the calendar's zone.
                const sortedDayAppts = sortLiveFirst(appointmentsOnDay(appointments, zone, dateStr), currentTime);
                const dayBusy = busyBlocksOnDay(busyBlocks, zone, dateStr);

                return (
                  <div key={colIdx} className="p-2 border-r border-gray-200 text-[12px] font-medium text-[var(--ink)] last:border-r-0 relative flex flex-col">
                    <span className="font-semibold text-gray-700">{dayNumber}</span>
                    <div className="mt-1 flex flex-col gap-1 overflow-y-auto max-h-[160px]">
                      {sortedDayAppts.map((appt) => {
                        const isHappening = isAppointmentHappeningNow(appt, currentTime);
                        const timeStr = formatEventTimes(zone, appt.startsAt, appt.endsAt);

                        return (
                          <div
                            key={appt.id}
                            onClick={() => onOpenJob(appt.id)}
                            className={`px-2 py-1.5 rounded-md cursor-pointer transition-all ${
                              isHappening
                                ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400 hover:bg-emerald-700"
                                : "bg-[#E8EFEA] text-[var(--forest)] border border-[#D5E3DB] hover:opacity-85"
                            }`}
                          >
                            {isHappening && (
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">Live now</span>
                              </div>
                            )}
                            <div className="text-[11px] font-semibold truncate leading-tight">{appt.title}</div>
                            <div className={`text-[10px] leading-tight mt-0.5 ${isHappening ? "text-emerald-100" : "opacity-90"}`}>
                              {timeStr}
                            </div>
                          </div>
                        );
                      })}
                      {dayBusy.map((block) => (
                        <div key={block.id} className="px-1.5 py-1 bg-gray-100 text-gray-700 rounded-md">
                          <div className="text-[11px] font-medium truncate leading-tight">{block.label || "Busy"}</div>
                          <div className="text-[10px] opacity-80 leading-tight mt-0.5 truncate">{formatBusyBlockTimes(zone, block)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
