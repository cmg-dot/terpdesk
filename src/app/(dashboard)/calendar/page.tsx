"use client";

import { motion } from "framer-motion";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { fetchLiveRequests } from "@/app/actions/getRequests";
import { getIanaZone } from "@/utils/timezone";
import { isAppointmentHappeningNow } from "@/utils/happeningNow";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { formatReference } from "@/utils/statusEngine";

export default function CalendarPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  // 60-second tick for live status engine
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchLiveRequests().then(setRequests).catch(console.error);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));

  // Add trailing empty cells to complete the grid (if 35 or 42)
  const totalCells = cells.length > 35 ? 42 : 35;
  while (cells.length < totalCells) cells.push(null);

  const getWeekDays = (date: Date) => {
    const current = new Date(date);
    current.setDate(current.getDate() - current.getDay());
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return week;
  };

  const weekDays = getWeekDays(currentDate);

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const getRequestSchedule = (req: any) => {
    const tz = req.details?.timeZone || req.data?.details?.timeZone || req.data?.timeZone || req.timeZone || 'America/Los_Angeles';
    const safeZone = getIanaZone(tz);
    
    const startsAt = req.startsAt || (req.data?.details?.startDate && req.data?.details?.startTime ? `${req.data.details.startDate}T${req.data.details.startTime}` : null) || req.data?.startsAt;
    
    let endsAt = req.endsAt || req.data?.endsAt;
    if (!endsAt && req.data?.details?.endDate && req.data?.details?.endTime) {
      try {
        endsAt = `${req.data.details.endDate}T${req.data.details.endTime}`;
      } catch (e) {}
    }
    if (!endsAt && startsAt) {
      endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
    }

    return { safeZone, startsAt, endsAt };
  };

  // Match request date using its scheduled safeZone to prevent UTC/browser drift
  const isEventOnDate = (cellDate: Date | null, req: any) => {
    if (!cellDate || !req) return false;
    const { safeZone, startsAt } = getRequestSchedule(req);
    if (!startsAt) return false;
    try {
      const reqDateKey = formatInTimeZone(new Date(startsAt), safeZone, 'yyyy-MM-dd');
      const cellDateKey = format(cellDate, 'yyyy-MM-dd');
      return reqDateKey === cellDateKey;
    } catch (e) {
      return false;
    }
  };

  const formatEventTime = (startsAt?: string, endsAt?: string, tz?: string) => {
    if (!startsAt) return "Time not specified";
    const safeZone = getIanaZone(tz);
    try {
      const start = new Date(startsAt);
      const end = endsAt ? new Date(endsAt) : start;
      const timeStart = formatInTimeZone(start, safeZone, 'h:mm a');
      const timeEnd = formatInTimeZone(end, safeZone, 'h:mm a zzz');
      return `${timeStart} – ${timeEnd}`;
    } catch (e) {
      return "Time not specified";
    }
  };

  const sortDayRequests = (reqs: any[]) => {
    return [...reqs].sort((a, b) => {
      const aNow = isAppointmentHappeningNow(a, currentTime);
      const bNow = isAppointmentHappeningNow(b, currentTime);
      if (aNow && !bNow) return -1;
      if (!aNow && bNow) return 1;
      const timeA = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const timeB = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      return timeA - timeB;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Agency calendar</h1>
        <p className="text-[15px] text-[var(--sage)]">
          One appointment per job, with coverage across its independent slots.
        </p>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-8 gap-4">
        <div className="flex items-center gap-2">
          <button onClick={handlePrev} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <button onClick={handleToday} className="px-5 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button onClick={handleNext} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        <div className="flex items-center bg-[#F4F3EF] rounded-full px-4 py-2 text-sm text-gray-700 font-medium w-fit">
          <CalendarIcon className="w-4 h-4 mr-2" />
          {format(currentDate, 'MM/dd/yyyy')}
        </div>
      </div>

      {/* View Toggle */}
      <div className="rounded-full p-1 flex mt-4 max-w-md relative z-10">
        {(['month', 'week', 'day'] as const).map((v) => (
          <button 
            key={v}
            onClick={() => setView(v)}
            className={`relative flex-1 text-center py-2 text-sm rounded-full outline-none transition-colors duration-200 ${view === v ? 'text-white font-medium' : 'text-[var(--sage)] hover:text-[var(--ink)]'}`}
          >
            {view === v && (
              <motion.div
                layoutId="agencyCalendarTogglePill"
                className="absolute inset-0 bg-[#0B3B32] rounded-full"
                initial={false}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 capitalize">
              {v}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[13px] text-[var(--sage)] mt-4">
        {view === 'day' 
          ? format(currentDate, 'EEEE, MMMM d, yyyy') 
          : view === 'week' 
            ? `Week of ${format(weekDays[0], 'MMMM d, yyyy')}` 
            : format(currentDate, 'MMMM yyyy')}
      </p>

      {/* MONTH VIEW */}
      {view === 'month' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mt-6 overflow-hidden">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-xs font-semibold text-[var(--sage)] uppercase tracking-wider py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 border-t border-l border-gray-200">
                {cells.map((date, idx) => {
                  const dayRequests = date ? requests.filter(r => isEventOnDate(date, r)) : [];
                  const sortedDayRequests = sortDayRequests(dayRequests);

                  return (
                    <div key={idx} className={`min-h-[120px] border-r border-b border-gray-200 p-2 flex flex-col ${!date ? 'bg-[#F9F8F4]' : 'bg-white'}`}>
                      {date && (
                        <div className="text-sm font-medium text-[var(--ink)] mb-1 px-1">
                          {date.getDate()}
                        </div>
                      )}
                      <div className="flex-1 overflow-y-auto space-y-1 max-h-[160px]">
                        {sortedDayRequests.map(req => {
                          const isHappening = isAppointmentHappeningNow(req, currentTime);
                          const { safeZone, startsAt, endsAt } = getRequestSchedule(req);
                          const timeStr = formatEventTime(startsAt, endsAt, safeZone);
                          const refCode = formatReference(req.id);

                          return (
                            <Link 
                              href={`/requests/${req.id}`} 
                              key={req.id} 
                              className={`block rounded-md p-1.5 text-xs transition-all ${
                                isHappening 
                                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400 hover:bg-emerald-700' 
                                  : 'bg-[#E5F0EB] text-[#0A3D31] border border-[#CDE0D8] hover:bg-[#D5E6DF]'
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
                              <div className="font-semibold truncate leading-tight">{req.title || "Request"}</div>
                              <div className={`text-[10px] leading-tight mt-0.5 ${isHappening ? 'text-emerald-100' : 'opacity-85'}`}>
                                {timeStr}
                              </div>
                              <div className={`text-[10px] leading-tight mt-0.5 flex items-center justify-between ${isHappening ? 'text-emerald-200' : 'opacity-75'}`}>
                                <span>{refCode}</span>
                                <span className="capitalize">{req.status}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {view === 'week' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mt-6 overflow-hidden">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-7 border-b border-gray-200">
                {weekDays.map((dayDate, dayIdx) => (
                  <div key={dayIdx} className="text-center py-3 border-r border-gray-100 last:border-r-0">
                    <div className="text-[12px] font-semibold text-[var(--ink)] uppercase tracking-wider">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()]}
                    </div>
                    <div className="text-sm font-semibold text-gray-700 mt-0.5">
                      {format(dayDate, 'MMM d')}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 min-h-[500px]">
                {weekDays.map((dayDate, dayIdx) => {
                  const dayRequests = requests.filter(r => isEventOnDate(dayDate, r));
                  const sortedDayRequests = sortDayRequests(dayRequests);

                  return (
                    <div key={dayIdx} className="border-r border-gray-100 last:border-r-0 p-2 flex flex-col gap-2 bg-[#FAFAFA]/50">
                      {sortedDayRequests.length === 0 ? (
                        <div className="text-[11px] text-gray-400 text-center py-6">
                          No bookings
                        </div>
                      ) : (
                        sortedDayRequests.map(req => {
                          const isHappening = isAppointmentHappeningNow(req, currentTime);
                          const { safeZone, startsAt, endsAt } = getRequestSchedule(req);
                          const timeStr = formatEventTime(startsAt, endsAt, safeZone);
                          const refCode = formatReference(req.id);

                          return (
                            <Link 
                              href={`/requests/${req.id}`} 
                              key={req.id} 
                              className={`block rounded-lg p-2.5 text-xs transition-all ${
                                isHappening 
                                  ? 'bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400 hover:bg-emerald-700' 
                                  : 'bg-[#E5F0EB] text-[#0A3D31] border border-[#CDE0D8] hover:bg-[#D5E6DF]'
                              }`}
                            >
                              {isHappening && (
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                  </span>
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">Live now</span>
                                </div>
                              )}
                              <div className="font-semibold truncate">{req.title || "Request"}</div>
                              <div className={`text-[10px] mt-0.5 ${isHappening ? 'text-emerald-100' : 'opacity-85'}`}>{timeStr}</div>
                              <div className={`text-[10px] mt-1 flex items-center justify-between ${isHappening ? 'text-emerald-200' : 'opacity-75'}`}>
                                <span>{refCode}</span>
                                <span className="capitalize">{req.status}</span>
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DAY VIEW */}
      {view === 'day' && (() => {
        const dayRequests = requests.filter(r => isEventOnDate(currentDate, r));
        const sortedDayRequests = sortDayRequests(dayRequests);

        return (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 mt-6 min-h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-[var(--ink)]">
                {format(currentDate, 'EEEE, MMMM d, yyyy')}
              </h2>
              <span className="text-sm text-[var(--sage)]">
                {sortedDayRequests.length} {sortedDayRequests.length === 1 ? 'appointment' : 'appointments'}
              </span>
            </div>
            
            {sortedDayRequests.length === 0 ? (
              <div className="flex items-center justify-center h-48 border border-dashed border-gray-200 rounded-xl">
                <p className="text-[var(--sage)]">Nothing scheduled for this day.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedDayRequests.map(req => {
                  const isHappening = isAppointmentHappeningNow(req, currentTime);
                  const { safeZone, startsAt, endsAt } = getRequestSchedule(req);
                  const timeStr = formatEventTime(startsAt, endsAt, safeZone);
                  const refCode = formatReference(req.id);
                  const org = req.requester?.org || req.data?.intake?.program || "General";

                  return (
                    <Link 
                      href={`/requests/${req.id}`} 
                      key={req.id} 
                      className={`block rounded-xl p-4 sm:p-5 transition-all ${
                        isHappening 
                          ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400 hover:bg-emerald-700' 
                          : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isHappening && <HappeningNowBadge size="sm" />}
                            <h3 className="font-semibold text-base">{req.title || "Request"}</h3>
                          </div>
                          <div className={`text-sm ${isHappening ? 'text-emerald-100' : 'text-[var(--ink)]'}`}>
                            {timeStr}
                          </div>
                          <div className={`text-xs ${isHappening ? 'text-emerald-200' : 'text-[var(--sage)]'}`}>
                            Organization: <span className="font-medium">{org}</span>
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                          <span className={`text-xs font-mono px-2.5 py-1 rounded-md ${
                            isHappening 
                              ? 'bg-emerald-700/60 text-white' 
                              : 'bg-white border border-gray-200 text-gray-700 font-medium'
                          }`}>
                            {refCode}
                          </span>
                          <span className={`rounded-full px-3 py-0.5 text-xs font-medium capitalize ${
                            isHappening 
                              ? 'bg-emerald-500 text-white' 
                              : 'bg-[#E5F0EB] text-[#0A3D31]'
                          }`}>
                            {req.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </motion.div>
  );
}
