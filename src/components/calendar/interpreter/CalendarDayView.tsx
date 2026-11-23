import { format } from "date-fns";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import type { CalendarViewProps } from "@/components/calendar/interpreter/CalendarMonthView";
import { appointmentsOnDay, busyBlocksOnDay, formatBusyBlockTimes, formatEventTimes, sortLiveFirst } from "@/lib/interpreterCalendar";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";

interface CalendarDayViewProps extends CalendarViewProps {
  /** "Block time on this day" (the page scrolls to the busy-time form). */
  onBlockTime: () => void;
}

/** The day agenda of the interpreter's calendar: the day's bookings, then its private busy time. */
export function CalendarDayView({ currentDate, appointments, busyBlocks, zone, currentTime, onOpenJob, onBlockTime }: CalendarDayViewProps) {
  const cellDateStr = format(currentDate, "yyyy-MM-dd");
  const sortedJobs = sortLiveFirst(appointmentsOnDay(appointments, zone, cellDateStr), currentTime);
  const dayBlocks = busyBlocksOnDay(busyBlocks, zone, cellDateStr);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-12 shadow-sm">
      <h2 className="text-[18px] font-semibold text-[var(--ink)] mb-4">{format(currentDate, "EEEE, MMMM d, yyyy")}</h2>

      {sortedJobs.length === 0 && dayBlocks.length === 0 ? (
        <p className="text-[14px] text-[var(--sage)] mb-6">Nothing scheduled for this day.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {sortedJobs.map((appt) => {
            const isHappening = isAppointmentHappeningNow(appt, currentTime);
            const timeStr = formatEventTimes(zone, appt.startsAt, appt.endsAt);

            return (
              <div
                key={appt.id}
                onClick={() => onOpenJob(appt.id)}
                className={`p-4 rounded-xl cursor-pointer transition-all ${
                  isHappening
                    ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400 hover:bg-emerald-700"
                    : "bg-[#E8EFEA] text-[var(--forest)] border border-[#D5E3DB] hover:opacity-90"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {isHappening && <HappeningNowBadge size="sm" />}
                    <span className="text-[14px] font-semibold">{appt.title}</span>
                  </div>
                  <div className={`text-[13px] ${isHappening ? "text-emerald-100" : "text-[var(--forest)]"}`}>{timeStr}</div>
                </div>
              </div>
            );
          })}

          {dayBlocks.map((block) => (
            <div key={block.id} className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-800">
              <div className="space-y-1">
                <span className="text-[14px] font-semibold">{block.label || "Busy"}</span>
                <div className="text-[13px] text-gray-600">{formatBusyBlockTimes(zone, block)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onBlockTime}
        className="px-5 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors mt-2"
      >
        Block time on this day
      </button>
    </div>
  );
}
