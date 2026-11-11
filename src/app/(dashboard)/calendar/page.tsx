"use client";

import { motion } from "framer-motion";
import { Suspense, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fetchRequestList } from "@/app/actions/getRequestList";
import { agencyDateKey, civilDate } from "@/lib/agencyTime";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarHistoryNotice } from "@/components/calendar/CalendarHistoryNotice";
import { CalendarModeToggle } from "@/components/calendar/CalendarModeToggle";
import type { CalendarMode } from "@/components/calendar/CalendarModeToggle";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarNav } from "@/components/calendar/CalendarNav";
import { CalendarSearch } from "@/components/calendar/CalendarSearch";
import { CalendarStatusFilter } from "@/components/calendar/CalendarStatusFilter";
import { CalendarTransition } from "@/components/calendar/CalendarTransition";
import { CalendarViewToggle } from "@/components/calendar/CalendarViewToggle";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { InterpreterTimeline } from "@/components/calendar/InterpreterTimeline";
import { useCalendarFocus } from "@/hooks/useCalendarFocus";
import { useCalendarKeys } from "@/hooks/useCalendarKeys";
import { useCalendarNavigation } from "@/hooks/useCalendarNavigation";
import { useDayIndex, useScheduledCards } from "@/hooks/useDayIndex";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import type { CalendarRequest } from "@/lib/calendarDayIndex";
import { rangeBeforeHistory } from "@/lib/calendarHistory";
import { buildSearchEntries } from "@/lib/calendarSearch";
import { rangeKeyFor, weekStartKey } from "@/lib/calendarNav";
import type { CalendarView } from "@/lib/calendarNav";
import { DEFAULT_STATUS_FILTER } from "@/lib/requestListFilter";

/** useSearchParams needs a Suspense boundary above it, so the page itself is just that boundary around the calendar. */
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarScreen />
    </Suspense>
  );
}

function CalendarScreen() {
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Job View is the original calendar (month / week / day of job cards). Interpreter View is the resource timeline.
  const [mode, setMode] = useState<CalendarMode>("jobs");
  // Same filter and default as Requests & assignments. Cancelled jobs stay off today and the days ahead until asked for; on past days they show muted.
  const [statusFilter, setStatusFilter] = useState<string>(DEFAULT_STATUS_FILTER);

  // The minute clock only moves the live / finished styling and the "today" highlight; it never rebuilds the grid's data.
  const nowMs = useMinuteClock();
  // Today in Los Angeles, whatever zone this browser is in, so it rolls over at Pacific midnight.
  const todayKey = agencyDateKey(nowMs);
  const nav = useCalendarNavigation({ today: todayKey });
  const cards = useScheduledCards(requests);
  const index = useDayIndex(cards, statusFilter, nowMs);
  const entries = useMemo(() => buildSearchEntries(cards), [cards]);

  useEffect(() => {
    fetchRequestList().then((rows) => { setRequests(rows); setLoaded(true); }).catch(() => console.error("[calendar page] request failed"));
  }, []);

  const interpreters = mode === "interpreters";
  // The Interpreter View is one day wide, so its arrows (and Left / Right) move one day; Shift + arrow moves a week.
  const stepUnit: CalendarView = interpreters ? "day" : nav.view;
  useCalendarKeys(interpreters, (unit, direction) => (direction > 0 ? nav.next(unit) : nav.prev(unit)));
  const label = interpreters || nav.view === "day"
    ? format(nav.date, "EEEE, MMMM d, yyyy")
    : nav.view === "week"
      ? `Week of ${format(civilDate(weekStartKey(nav.dateKey)), "MMMM d, yyyy")}`
      : format(nav.date, "MMMM yyyy");
  const focus = useCalendarFocus({
    entries,
    loaded,
    index,
    goToDate: nav.goToDate,
    showAll: () => setStatusFilter("All appointments"),
    viewKey: `${mode}:${nav.view}:${rangeKeyFor(nav.dateKey, nav.view)}`,
  });
  const viewProps = { dateKey: nav.dateKey, todayKey, index, nowMs, highlightId: focus.highlightId };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[1200px] mx-auto p-6 space-y-6 pb-24 antialiased">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink)]">Agency calendar</h1>
        <p className="text-[15px] text-[var(--sage)]">One appointment per job, with coverage across its independent slots.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CalendarModeToggle mode={mode} onChange={setMode} />
        <CalendarSearch entries={entries} value={focus.searchText} onChange={focus.setSearchText} onSelect={focus.select} onClear={focus.clear} nowMs={nowMs} />
      </div>

      <div className="mt-8">
        <CalendarNav
          dateKey={nav.dateKey}
          todayKey={todayKey}
          unit={stepUnit}
          onPrev={() => nav.prev(stepUnit)}
          onNext={() => nav.next(stepUnit)}
          onToday={nav.goToToday}
          onPick={nav.goToDate}
        />
      </div>

      {/* View Toggle (Job View only) */}
      {!interpreters && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <CalendarViewToggle view={nav.view} onChange={nav.setView} />
          <CalendarStatusFilter value={statusFilter} onChange={setStatusFilter} />
        </div>
      )}

      <p className="text-[13px] text-[var(--sage)] mt-4">
        {label}
        {interpreters && <span className="hidden sm:inline"> · Left / Right arrow: one day, Shift + arrow: one week</span>}
      </p>

      {rangeBeforeHistory(nav.dateKey, interpreters ? "day" : nav.view) && <CalendarHistoryNotice />}

      {!interpreters && (
        <div className="mt-6">
          <CalendarTransition transitionKey={`${nav.view}:${rangeKeyFor(nav.dateKey, nav.view)}`} direction={nav.direction}>
            {nav.view === "month" && <CalendarMonthView {...viewProps} />}
            {nav.view === "week" && <CalendarWeekView {...viewProps} />}
            {nav.view === "day" && <CalendarDayView {...viewProps} />}
          </CalendarTransition>
        </div>
      )}

      {/* INTERPRETER VIEW (resource timeline): its own date-scoped fetch, the Job View's data is not used */}
      {interpreters && <InterpreterTimeline dateKey={nav.dateKey} nowMs={nowMs} />}
    </motion.div>
  );
}
