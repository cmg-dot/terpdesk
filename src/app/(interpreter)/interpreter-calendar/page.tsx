"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { getIanaZone } from "@/utils/timezone";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { useGlobalState } from "@/context/GlobalContext";
import { td_availability_view } from "@/app/actions/availability";
import ConnectedAvailability from "@/connected/availability";

type ViewType = 'month' | 'week' | 'day';

interface Appointment {
  id: string;
  requestId?: string;
  start: Date;
  end: Date;
  startsAt: string;
  endsAt: string;
  title: string;
  agencyName: string;
  timeZone?: string;
  status?: string;
  raw?: any;
}
interface BusyBlock { id: string; label: string; timeZone: string; isAllDay: boolean; start: string; end: string; }

export default function InterpreterCalendarPage() {
  const router = useRouter();
  const { jobs: contextJobs } = useInterpreterJobs();
  const { currentUser } = useGlobalState();
  const interpreterId = currentUser?.id || 'terp-1';
  const [view, setView] = useState<ViewType>('month');

  // UTC provides a hydration-safe initial value. The persisted profile timezone
  // replaces it after mount; the calendar never blocks on that request.
  const [baseTimezone, setBaseTimezone] = useState<string>('UTC');
  const [isTimezoneLoading, setIsTimezoneLoading] = useState(true);
  const safeBaseTimezone = getIanaZone(baseTimezone);

  // Return a Date representing today at 12:00:00 in the interpreter's base timezone
  const getTodayInBaseTimezone = React.useCallback((tz: string) => {
    const safeZone = getIanaZone(tz);
    const dateStr = formatInTimeZone(new Date(), safeZone, 'yyyy-MM-dd');
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, []);

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const handleTimezoneChange = React.useCallback((newTz: string) => {
    const resolvedTimezone = getIanaZone(newTz);
    setBaseTimezone(resolvedTimezone);
    setCurrentDate(getTodayInBaseTimezone(resolvedTimezone));
    setIsTimezoneLoading(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`terpdesk_timezone_${interpreterId}`, newTz);
        localStorage.setItem('terpdesk_interpreter_timezone', newTz);
        const stored = localStorage.getItem('terpdesk_availability');
        const parsed = stored ? JSON.parse(stored) : {};
        parsed.baseTimezone = newTz;
        localStorage.setItem('terpdesk_availability', JSON.stringify(parsed));
      } catch (err) {}
    }
  }, [getTodayInBaseTimezone, interpreterId]);
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  // 60-second tick for live status engine
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatBadge = (d: Date) => format(d, 'MM/dd/yyyy');
  const formatMonthYear = (d: Date) => format(d, 'MMMM yyyy');
  const formatDayViewSubtitle = (d: Date) => format(d, 'EEEE, MMMM d, yyyy');

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
    if (view === 'week') newDate.setDate(newDate.getDate() - 7);
    if (view === 'day') newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
    if (view === 'week') newDate.setDate(newDate.getDate() + 7);
    if (view === 'day') newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(getTodayInBaseTimezone(safeBaseTimezone));
  };

  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);
  const [acceptedAppointments, setAcceptedAppointments] = useState<Appointment[]>([]);

  const handleSlotClick = (day?: Date, hour?: number) => {
    document.getElementById('private-busy-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const parseSafeDate = (dateVal: any): string | null => {
    if (!dateVal) return null;
    let d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d.toISOString();
    if (typeof dateVal === 'string') {
      d = new Date(dateVal.replace(' ', 'T'));
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  };

  const reloadAvailability = React.useCallback(async () => {
    try {
      const data = await td_availability_view(interpreterId);
      if (data.profile?.timeZone) {
        const profileTimezone = getIanaZone(data.profile.timeZone);
        setBaseTimezone(profileTimezone);
        setCurrentDate(getTodayInBaseTimezone(profileTimezone));
      }
      if (data.busyBlocks) {
        setBusyBlocks(data.busyBlocks.map(b => ({
          id: b.id,
          label: b.title || 'Busy',
          timeZone: b.timeZone || data.profile?.timeZone || 'UTC',
          isAllDay: false,
          start: b.startsAt,
          end: b.endsAt,
        })));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsTimezoneLoading(false);
    }
  }, [getTodayInBaseTimezone, interpreterId]);

  useEffect(() => {
    void reloadAvailability();
  }, [reloadAvailability]);

  useEffect(() => {
    const loadJobs = () => {
      let sourceList: any[] = [];
      if (contextJobs && contextJobs.length > 0) {
        sourceList = contextJobs;
      } else {
        const storedJobs = localStorage.getItem('terpdesk_interpreter_jobs');
        if (storedJobs) {
          try {
            sourceList = JSON.parse(storedJobs);
          } catch (e) { }
        }
      }

      const bookedJobs = sourceList
        .filter((j: any) => {
          const status = String(j.status || '').toLowerCase();
          return (status === 'booked' || status === 'accepted') &&
            !String(j.id).includes('fictional') &&
            !(j.title || '').includes('Fictional');
        })
        .map((j: any) => {
          const startsAt = j.startsAt || parseSafeDate(j.details?.startDate ? `${j.details.startDate}T${j.details.startTime || '00:00'}` : null) || new Date().toISOString();
          let endsAt = j.endsAt || parseSafeDate(j.details?.endDate ? `${j.details.endDate}T${j.details.endTime || '00:00'}` : null);
          if (!endsAt) {
            endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
          }

          return {
            id: j.id,
            requestId: j.requestId || j.id,
            start: new Date(startsAt),
            end: new Date(endsAt),
            startsAt,
            endsAt,
            title: j.title || 'Interpreting request',
            agencyName: j.agencyName || j.location || 'QA Fixture Agency',
            timeZone: j.timeZone || j.details?.timeZone,
            status: j.status,
            raw: j
          };
        });

      setAcceptedAppointments(bookedJobs);
    };

    loadJobs();
    window.addEventListener('storage', loadJobs);
    return () => window.removeEventListener('storage', loadJobs);
  }, [contextJobs]);

  // Clean time format helpers respecting interpreter's base timezone
  const formatEventTimes = (startsAt: string | Date, endsAt: string | Date) => {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    const startStr = formatInTimeZone(s, safeBaseTimezone, 'h:mm a');
    const endStr = formatInTimeZone(e, safeBaseTimezone, 'h:mm a zzz');
    return `${startStr} – ${endStr}`;
  };

  const formatBusyBlockTimes = (block: BusyBlock) => {
    const s = new Date(block.start);
    const e = new Date(block.end);
    const startH = parseInt(formatInTimeZone(s, safeBaseTimezone, 'H'), 10);
    const startM = parseInt(formatInTimeZone(s, safeBaseTimezone, 'm'), 10);
    const endH = parseInt(formatInTimeZone(e, safeBaseTimezone, 'H'), 10);
    const endM = parseInt(formatInTimeZone(e, safeBaseTimezone, 'm'), 10);
    const isAllDay = block.isAllDay || (startH === 0 && startM === 0 && endH === 0 && endM === 0);
    const tzAbbr = formatInTimeZone(s, safeBaseTimezone, 'zzz');
    if (isAllDay) {
      return `All day · ${tzAbbr}`;
    }
    return `${formatInTimeZone(s, safeBaseTimezone, 'h:mm a')} – ${formatInTimeZone(e, safeBaseTimezone, 'h:mm a zzz')}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] mb-2">
          My calendar
        </h1>
        <p className="text-[var(--sage)] text-[15px] max-w-2xl mb-6">
          Reserved assignments across your agencies, plus private busy time. Pending offers do not book your calendar.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={handlePrev} className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={handleToday} className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button onClick={() => document.getElementById('private-busy-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-4 py-2 rounded-full bg-[#1B433C] text-white text-[13px] font-medium hover:bg-[#14332D] transition-colors ">
            Block time
          </button>
          <button onClick={handleNext} className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-[#F3F4F6] px-4 py-2 rounded-full text-gray-600">
          <span className="text-[13px] font-medium">{formatBadge(currentDate)}</span>
          <CalendarIcon className="w-4 h-4" />
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center w-fit mx-auto p-1 bg-transparent mt-6 rounded-full relative z-10">
        {(['month', 'week', 'day'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative px-6 py-2 rounded-full text-sm font-medium whitespace-nowrap outline-none transition-colors duration-200 ${view === v ? 'text-white' : 'text-[var(--sage)] hover:text-[var(--ink)]'}`}
          >
            {view === v && (
              <motion.div layoutId="interpreterCalendarTogglePill" className="absolute inset-0 bg-[#0f3730] rounded-full" initial={false} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
            )}
            <span className="relative z-10 capitalize">{v}</span>
          </button>
        ))}
      </div>

      <p className="text-[13px] text-[var(--sage)] mt-4 mb-4">
        {view === 'day' ? formatDayViewSubtitle(currentDate) : view === 'week' ? `Week of ${formatBadge(currentDate)}` : formatMonthYear(currentDate)} · {isTimezoneLoading ? 'Loading calendar time zone…' : `Calendar time zone: ${safeBaseTimezone}`}
      </p>

      {/* MONTH VIEW */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-12 w-full overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center py-4 text-[12px] font-semibold text-[var(--ink)]">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="flex flex-col">
              {(() => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const firstDay = new Date(year, month, 1, 12, 0, 0).getDay();
                const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0).getDate();
                const rows = Math.ceil((firstDay + daysInMonth) / 7);

                return Array.from({ length: rows }).map((_, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-7 min-h-[130px] border-b border-gray-200 last:border-0">
                    {Array.from({ length: 7 }).map((_, colIdx) => {
                      const cellIndex = rowIdx * 7 + colIdx;
                      const dayNumber = cellIndex - firstDay + 1;
                      const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

                      if (!isCurrentMonth) {
                        return <div key={colIdx} className="p-2 border-r border-gray-200 bg-[#F5F4F0] last:border-r-0"></div>;
                      }

                      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayNumber.toString().padStart(2, '0')}`;

                      // Match appointments matching their true scheduled date in safeBaseTimezone
                      const dayAppts = acceptedAppointments.filter(a => {
                        const apptDate = formatInTimeZone(new Date(a.startsAt), safeBaseTimezone, 'yyyy-MM-dd');
                        return apptDate === dateStr;
                      });

                      // Match busy blocks strictly in safeBaseTimezone
                      const dayBusy = busyBlocks.filter(b => {
                        const blockDate = formatInTimeZone(new Date(b.start), safeBaseTimezone, 'yyyy-MM-dd');
                        return blockDate === dateStr;
                      });

                      // Prioritize happening now appointments at the top
                      const sortedDayAppts = [...dayAppts].sort((a, b) => {
                        const aHappening = isAppointmentHappeningNow(a, currentTime);
                        const bHappening = isAppointmentHappeningNow(b, currentTime);
                        if (aHappening && !bHappening) return -1;
                        if (!aHappening && bHappening) return 1;
                        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
                      });

                      return (
                        <div key={colIdx} className="p-2 border-r border-gray-200 text-[12px] font-medium text-[var(--ink)] last:border-r-0 relative flex flex-col">
                          <span className="font-semibold text-gray-700">{dayNumber}</span>
                          <div className="mt-1 flex flex-col gap-1 overflow-y-auto max-h-[160px]">
                            {sortedDayAppts.map(appt => {
                              const isHappening = isAppointmentHappeningNow(appt, currentTime);
                              const timeStr = formatEventTimes(appt.startsAt, appt.endsAt);

                              return (
                                <div
                                  key={appt.id}
                                  onClick={() => router.push(`/jobs/${appt.id}`)}
                                  className={`px-2 py-1.5 rounded-md cursor-pointer transition-all ${
                                    isHappening
                                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400 hover:bg-emerald-700'
                                      : 'bg-[#E8EFEA] text-[#0B3B32] border border-[#D5E3DB] hover:opacity-85'
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
                                  <div className={`text-[10px] leading-tight mt-0.5 ${isHappening ? 'text-emerald-100' : 'opacity-90'}`}>
                                    {timeStr}
                                  </div>
                                </div>
                              );
                            })}
                            {dayBusy.map(block => {
                              const timeStr = formatBusyBlockTimes(block);
                              return (
                                <div key={block.id} className="px-1.5 py-1 bg-gray-100 text-gray-700 rounded-md">
                                  <div className="text-[11px] font-medium truncate leading-tight">{block.label || 'Busy'}</div>
                                  <div className="text-[10px] opacity-80 leading-tight mt-0.5 truncate">{timeStr}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* WEEK VIEW TIME GRID */}
      {view === 'week' && (() => {
        const days = [];
        const startOfWeek = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate() - currentDate.getDay(),
          12,
          0,
          0
        );
        for (let i = 0; i < 7; i++) {
          const day = new Date(
            startOfWeek.getFullYear(),
            startOfWeek.getMonth(),
            startOfWeek.getDate() + i,
            12,
            0,
            0
          );
          days.push(day);
        }

        const hours = Array.from({ length: 24 }).map((_, i) => {
          if (i === 0) return '12 AM';
          if (i === 12) return '12 PM';
          return i < 12 ? `${i} AM` : `${i - 12} PM`;
        });

        return (
          <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden mb-12 shadow-sm w-full overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="grid grid-cols-[60px_1fr] border-b border-gray-200">
                <div className="border-r border-gray-100 bg-[#FAFAFA]"></div>
                <div className="grid grid-cols-7">
                  {days.map((day, i) => (
                    <div key={i} className="text-center py-4 border-r border-gray-100 last:border-r-0">
                      <div className="text-[13px] font-semibold text-[var(--ink)]">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()]}</div>
                      <div className="text-[13px] text-gray-500 mt-0.5">{day.getMonth() + 1}/{day.getDate()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scrollable grid area */}
              <div className="relative h-[800px] overflow-y-auto">
                <div className="grid grid-cols-[60px_1fr] absolute min-w-full">
                  {/* Time Axis */}
                  <div className="bg-[#FAFAFA] border-r border-gray-100 flex flex-col relative z-20">
                    {hours.map((h, i) => (
                      <div key={i} className="h-[60px] border-b border-gray-100 relative">
                        <span className={`absolute right-2 text-[10px] text-gray-500 font-medium ${i === 0 ? 'top-1' : '-top-[9px]'}`}>{h}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day Columns */}
                  <div className="grid grid-cols-7 relative">
                    {/* Background grid lines */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col">
                      {hours.map((_, i) => (
                        <div key={i} className="h-[60px] border-b border-gray-100 w-full" />
                      ))}
                    </div>

                    {days.map((day, dIdx) => {
                      const dayDateStr = format(day, 'yyyy-MM-dd');

                      // Match appointments whose scheduled date in safeBaseTimezone equals this day's date
                      const dayJobs = acceptedAppointments.filter(a => {
                        return formatInTimeZone(new Date(a.startsAt), safeBaseTimezone, 'yyyy-MM-dd') === dayDateStr;
                      });

                      const blocks = busyBlocks.filter(b => {
                        return formatInTimeZone(new Date(b.start), safeBaseTimezone, 'yyyy-MM-dd') === dayDateStr;
                      });

                      return (
                        <div key={dIdx} className="border-r border-gray-100 last:border-r-0 relative group">
                          {/* Interactive Click Grid */}
                          <div className="absolute inset-0 flex flex-col cursor-crosshair">
                            {hours.map((_, hIdx) => (
                              <div 
                                key={hIdx} 
                                className="h-[60px] hover:bg-gray-50/50 transition-colors z-0"
                                onClick={() => handleSlotClick(day, hIdx)}
                              />
                            ))}
                          </div>

                          {/* Plotted Events with true base timezone placement & duration */}
                          {dayJobs.map(appt => {
                            const startD = new Date(appt.startsAt);
                            const endD = new Date(appt.endsAt);

                            const startH = parseInt(formatInTimeZone(startD, safeBaseTimezone, 'H'), 10);
                            const startMMin = parseInt(formatInTimeZone(startD, safeBaseTimezone, 'm'), 10);
                            const startM = startH * 60 + startMMin;

                            const durationMin = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
                            const top = startM;
                            const height = Math.max(durationMin, 36);

                            const isHappening = isAppointmentHappeningNow(appt, currentTime);
                            const timeLabel = formatEventTimes(appt.startsAt, appt.endsAt);

                            return (
                              <div 
                                key={appt.id} 
                                onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${appt.id}`); }}
                                className={`absolute left-1 right-1 rounded-lg p-2 overflow-hidden cursor-pointer transition-all ${
                                  isHappening
                                    ? 'bg-emerald-600 text-white border-2 border-emerald-400 z-20 shadow-md ring-2 ring-emerald-500/40'
                                    : 'bg-[#E8EFEA] border border-[#D5E3DB] z-10 shadow-sm hover:shadow-md'
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
                                <div className={`text-[11px] font-semibold truncate ${isHappening ? 'text-white' : 'text-[#0B3B32]'}`}>{appt.title}</div>
                                <div className={`text-[10px] mt-0.5 truncate ${isHappening ? 'text-emerald-100' : 'text-[#14332D]'}`}>{timeLabel}</div>
                              </div>
                            );
                          })}

                          {/* Busy Blocks */}
                          {blocks.map(block => {
                            const s = new Date(block.start);
                            const e = new Date(block.end);
                            const startH = parseInt(formatInTimeZone(s, safeBaseTimezone, 'H'), 10);
                            const startMMin = parseInt(formatInTimeZone(s, safeBaseTimezone, 'm'), 10);
                            const startM = startH * 60 + startMMin;

                            const endH = parseInt(formatInTimeZone(e, safeBaseTimezone, 'H'), 10);
                            const endMMin = parseInt(formatInTimeZone(e, safeBaseTimezone, 'm'), 10);
                            let endM = endH * 60 + endMMin;
                            if (endM <= startM) {
                              endM = 1440;
                            }
                            const top = startM;
                            const height = Math.max(endM - startM, 36);

                            const timeLabel = formatBusyBlockTimes(block);
                            
                            return (
                              <div 
                                key={block.id} 
                                className="absolute left-1 right-1 bg-gray-100 border border-gray-200 rounded-lg p-2 overflow-hidden z-10"
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                <div className="text-[11px] font-semibold text-gray-700 truncate">{block.label || 'Busy'}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5 truncate">{timeLabel}</div>
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
      })()}

      {/* DAY VIEW (AGENDA STYLE) */}
      {view === 'day' && (() => {
        const cellDateStr = format(currentDate, 'yyyy-MM-dd');
        const dayJobs = acceptedAppointments.filter(a => {
          return formatInTimeZone(new Date(a.startsAt), safeBaseTimezone, 'yyyy-MM-dd') === cellDateStr;
        });
        const dayBlocks = busyBlocks.filter(b => {
          return formatInTimeZone(new Date(b.start), safeBaseTimezone, 'yyyy-MM-dd') === cellDateStr;
        });

        // Prioritize happening now appointments at top of list
        const sortedJobs = [...dayJobs].sort((a, b) => {
          const aHappening = isAppointmentHappeningNow(a, currentTime);
          const bHappening = isAppointmentHappeningNow(b, currentTime);
          if (aHappening && !bHappening) return -1;
          if (!aHappening && bHappening) return 1;
          return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
        });

        return (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-12 shadow-sm">
            <h2 className="text-[18px] font-semibold text-[var(--ink)] mb-4">
              {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </h2>

            {sortedJobs.length === 0 && dayBlocks.length === 0 ? (
              <p className="text-[14px] text-[var(--sage)] mb-6">
                Nothing scheduled for this day.
              </p>
            ) : (
              <div className="flex flex-col gap-3 mb-6">
                {sortedJobs.map(appt => {
                  const isHappening = isAppointmentHappeningNow(appt, currentTime);
                  const timeStr = formatEventTimes(appt.startsAt, appt.endsAt);

                  return (
                    <div 
                      key={appt.id} 
                      onClick={() => router.push(`/jobs/${appt.id}`)} 
                      className={`p-4 rounded-xl cursor-pointer transition-all ${
                        isHappening 
                          ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400 hover:bg-emerald-700' 
                          : 'bg-[#E8EFEA] text-[#0B3B32] border border-[#D5E3DB] hover:opacity-90'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isHappening && <HappeningNowBadge size="sm" />}
                          <span className="text-[14px] font-semibold">{appt.title}</span>
                        </div>
                        <div className={`text-[13px] ${isHappening ? 'text-emerald-100' : 'text-[#0B3B32]'}`}>
                          {timeStr}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {dayBlocks.map(block => {
                  const timeStr = formatBusyBlockTimes(block);

                  return (
                    <div
                      key={block.id}
                      className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-800"
                    >
                      <div className="space-y-1">
                        <span className="text-[14px] font-semibold">{block.label || 'Busy'}</span>
                        <div className="text-[13px] text-gray-600">
                          {timeStr}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={() => document.getElementById('private-busy-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-5 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors mt-2">
              Block time on this day
            </button>
          </div>
        );
      })()}

      {/* Manage availability & Private busy time Section */}
      <div className="mt-12">
        <h2 className="text-3xl font-semibold text-[var(--ink)] mb-2">Manage availability</h2>
        <p className="text-[var(--sage)] mb-6 max-w-3xl">
          Your usual working hours, plus any dates that differ. This is a preference, not a promise: nothing here cancels a booking, and an agency can still offer you work outside these hours.
        </p>

        <ConnectedAvailability
          interpreterId={interpreterId}
          currentTimezone={baseTimezone}
          onTimezoneChanged={handleTimezoneChange}
          onAvailabilityChanged={reloadAvailability}
        />
      </div>
    </motion.div>
  );
}
