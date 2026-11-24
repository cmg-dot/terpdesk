"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDayView } from "@/components/calendar/interpreter/CalendarDayView";
import { CalendarMonthView } from "@/components/calendar/interpreter/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/interpreter/CalendarWeekView";
import { CalendarNav } from "@/components/calendar/CalendarNav";
import { CalendarTransition } from "@/components/calendar/CalendarTransition";
import { CalendarFeedCard } from "@/components/calendar/interpreter/CalendarFeedCard";
import ConnectedAvailability from "@/connected/availability";
import { useInterpreterCalendar } from "@/hooks/useInterpreterCalendar";
import { formatBadgeDate, rangeKeyFor, weekStartKey } from "@/lib/calendarNav";

const scrollToBusyTime = () => document.getElementById("private-busy-time")?.scrollIntoView({ behavior: "smooth", block: "start" });
const scrollToFeed = () => document.getElementById("calendar-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function InterpreterCalendarPage() {
  const router = useRouter();
  const cal = useInterpreterCalendar();
  const { nav, safeBaseTimezone: zone, currentTime } = cal;
  const { view, goToDate } = nav;
  const currentDate = nav.date;
  const openJob = (id: string) => router.push(`/jobs/${id}`);
  const views = { currentDate, appointments: cal.acceptedAppointments, busyBlocks: cal.busyBlocks, personalJobs: cal.personalJobs, zone, currentTime, onOpenJob: openJob };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="max-w-[1200px] mx-auto p-4 md:p-8 w-full pb-24 antialiased">

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
      <CalendarNav
        size="sm"
        dateKey={nav.dateKey}
        todayKey={cal.todayKey}
        unit={view}
        onPrev={() => nav.prev()}
        onNext={() => nav.next()}
        onToday={nav.goToToday}
        onPick={goToDate}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/my-work" className="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-[13px] font-medium hover:bg-[var(--surface)] transition-colors">
              Add a personal job
            </Link>
            <button onClick={scrollToBusyTime} className="px-4 py-2 rounded-full bg-[var(--forest-soft)] text-white text-[13px] font-medium hover:bg-[var(--forest-deep)] transition-colors">
              Block time
            </button>
            <button onClick={scrollToFeed} className="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-[13px] font-medium hover:bg-[var(--surface)] transition-colors">
              Subscribe
            </button>
          </div>
        }
      />

      {/* View Toggle */}
      <div className="flex items-center w-fit mx-auto p-1 bg-transparent mt-6 rounded-full relative z-10">
        {(["month", "week", "day"] as const).map((v) => (
          <button
            key={v}
            onClick={() => nav.setView(v)}
            className={`relative px-6 py-2 rounded-full text-sm font-medium whitespace-nowrap outline-none transition-colors duration-200 ${view === v ? "text-white" : "text-[var(--sage)] hover:text-[var(--ink)]"}`}
          >
            {view === v && (
              <motion.div layoutId="interpreterCalendarTogglePill" className="absolute inset-0 bg-[#0f3730] rounded-full" initial={false} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
            )}
            <span className="relative z-10 capitalize">{v}</span>
          </button>
        ))}
      </div>

      <p className="text-[13px] text-[var(--sage)] mt-4 mb-4">
        {view === "day" ? format(currentDate, "EEEE, MMMM d, yyyy") : view === "week" ? `Week of ${formatBadgeDate(weekStartKey(nav.dateKey))}` : format(currentDate, "MMMM yyyy")} · {cal.isTimezoneLoading ? "Loading calendar time zone…" : `Calendar time zone: ${zone}`}
      </p>

      <CalendarTransition transitionKey={`${view}:${rangeKeyFor(nav.dateKey, view)}`} direction={nav.direction}>
        {view === "month" && <CalendarMonthView {...views} />}
        {view === "week" && <CalendarWeekView {...views} onSlotClick={scrollToBusyTime} />}
        {view === "day" && <CalendarDayView {...views} onBlockTime={scrollToBusyTime} />}
      </CalendarTransition>

      <CalendarFeedCard />

      {/* Manage availability & Private busy time Section */}
      <div className="mt-12">
        <h2 className="text-3xl font-semibold text-[var(--ink)] mb-2">Manage availability</h2>
        <p className="text-[var(--sage)] mb-6 max-w-3xl">
          Your usual working hours, plus any dates that differ. This is a preference, not a promise: nothing here cancels a booking, and an agency can still offer you work outside these hours.
        </p>

        <ConnectedAvailability
          interpreterId={cal.interpreterId}
          currentTimezone={cal.baseTimezone}
          onTimezoneChanged={cal.handleTimezoneChange}
          onAvailabilityChanged={cal.reloadAvailability}
        />
      </div>
    </motion.div>
  );
}
