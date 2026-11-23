import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { CalendarViewProps } from "@/components/calendar/interpreter/CalendarMonthView";
import { appointmentsOnDay, busyBlocksOnDay, formatBusyBlockTimes, formatEventTimes } from "@/lib/interpreterCalendar";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

interface CalendarWeekViewProps extends CalendarViewProps {
  /** A click on an empty slot (the page scrolls to the busy-time form). */
  onSlotClick: () => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const HOURS = Array.from({ length: 24 }).map((_, i) => {
  if (i === 0) return "12 AM";
  if (i === 12) return "12 PM";
  return i < 12 ? `${i} AM` : `${i - 12} PM`;
});

/** Minutes after midnight, in the calendar's zone. */
const minutesOfDay = (date: Date, zone: string): number =>
  parseInt(formatInTimeZone(date, zone, "H"), 10) * 60 + parseInt(formatInTimeZone(date, zone, "m"), 10);

/** The week time grid of the interpreter's calendar: bookings and busy time placed by their true start and length. */
export function CalendarWeekView({ currentDate, appointments, busyBlocks, personalJobs, zone, currentTime, onOpenJob, onSlotClick }: CalendarWeekViewProps) {
  const startOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - currentDate.getDay(), 12, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i, 12, 0, 0));

  return (
    <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden mb-12 shadow-sm w-full overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid grid-cols-[60px_1fr] border-b border-gray-200">
          <div className="border-r border-gray-100 bg-[#FAFAFA]"></div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => (
              <div key={i} className="text-center py-4 border-r border-gray-100 last:border-r-0">
                <div className="text-[13px] font-semibold text-[var(--ink)]">{WEEKDAYS[day.getDay()]}</div>
                <div className="text-[13px] text-gray-500 mt-0.5">{day.getMonth() + 1}/{day.getDate()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-[800px] overflow-y-auto">
          <div className="grid grid-cols-[60px_1fr] absolute min-w-full">
            <div className="bg-[#FAFAFA] border-r border-gray-100 flex flex-col relative z-20">
              {HOURS.map((h, i) => (
                <div key={i} className="h-[60px] border-b border-gray-100 relative">
                  <span className={`absolute right-2 text-[10px] text-gray-500 font-medium ${i === 0 ? "top-1" : "-top-[9px]"}`}>{h}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 relative">
              <div className="absolute inset-0 pointer-events-none flex flex-col">
                {HOURS.map((_, i) => (
                  <div key={i} className="h-[60px] border-b border-gray-100 w-full" />
                ))}
              </div>

              {days.map((day, dIdx) => {
                const dayDateStr = format(day, "yyyy-MM-dd");
                const dayJobs = appointmentsOnDay(appointments, zone, dayDateStr);
                const blocks = busyBlocksOnDay(busyBlocks, zone, dayDateStr);
                const dayPersonal = busyBlocksOnDay(personalJobs, zone, dayDateStr);

                return (
                  <div key={dIdx} className="border-r border-gray-100 last:border-r-0 relative group">
                    <div className="absolute inset-0 flex flex-col cursor-crosshair">
                      {HOURS.map((_, hIdx) => (
                        <div key={hIdx} className="h-[60px] hover:bg-gray-50/50 transition-colors z-0" onClick={onSlotClick} />
                      ))}
                    </div>

                    {dayJobs.map((appt) => {
                      const startD = new Date(appt.startsAt);
                      const endD = new Date(appt.endsAt);
                      const top = minutesOfDay(startD, zone);
                      const durationMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
                      const height = Math.max(durationMin, 36);
                      const isHappening = isAppointmentHappeningNow(appt, currentTime);
                      const timeLabel = formatEventTimes(zone, appt.startsAt, appt.endsAt);

                      return (
                        <div
                          key={appt.id}
                          onClick={(e) => { e.stopPropagation(); onOpenJob(appt.id); }}
                          className={`absolute left-1 right-1 rounded-lg p-2 overflow-hidden cursor-pointer transition-all ${
                            isHappening
                              ? "bg-emerald-600 text-white border-2 border-emerald-400 z-20 shadow-md ring-2 ring-emerald-500/40"
                              : "bg-[#E8EFEA] border border-[#D5E3DB] z-10 shadow-sm hover:shadow-md"
                          }`}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          {isHappening && (
                            <div className="flex items-center gap-1 mb-1">
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">Live now</span>
                            </div>
                          )}
                          <div className={`text-[11px] font-semibold truncate ${isHappening ? "text-white" : "text-[var(--forest)]"}`}>{appt.title}</div>
                          <div className={`text-[10px] mt-0.5 truncate ${isHappening ? "text-emerald-100" : "text-[var(--forest-deep)]"}`}>{timeLabel}</div>
                        </div>
                      );
                    })}

                    {dayPersonal.map((block) => {
                      const top = minutesOfDay(new Date(block.start), zone);
                      let endM = minutesOfDay(new Date(block.end), zone);
                      if (endM <= top) endM = 1440;
                      return (
                        <div
                          key={block.id}
                          data-personal-job={block.id}
                          title="Personal job"
                          className="absolute left-1 right-1 rounded-lg border border-[var(--forest)]/25 bg-[var(--tint)] p-2 overflow-hidden z-10"
                          style={{ top: `${top}px`, height: `${Math.max(endM - top, 36)}px` }}
                        >
                          <div className="text-[11px] font-semibold text-[var(--tint-ink)] truncate">{block.label}</div>
                          <div className="text-[10px] text-[var(--tint-ink)] opacity-80 mt-0.5 truncate">{formatBusyBlockTimes(zone, block)}</div>
                        </div>
                      );
                    })}

                    {blocks.map((block) => {
                      const top = minutesOfDay(new Date(block.start), zone);
                      let endM = minutesOfDay(new Date(block.end), zone);
                      if (endM <= top) endM = 1440;
                      const height = Math.max(endM - top, 36);

                      return (
                        <div
                          key={block.id}
                          className="absolute left-1 right-1 bg-gray-100 border border-gray-200 rounded-lg p-2 overflow-hidden z-10"
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <div className="text-[11px] font-semibold text-gray-700 truncate">{block.label || "Busy"}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate">{formatBusyBlockTimes(zone, block)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
