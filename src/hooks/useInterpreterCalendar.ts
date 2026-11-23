"use client";

import React, { useEffect, useState } from "react";
import { td_availability_view } from "@/app/actions/availabilityView";
import { useGlobalState } from "@/context/GlobalContext";
import { useInterpreterJobs } from "@/context/InterpreterJobsContext";
import { useCalendarNavigation } from "@/hooks/useCalendarNavigation";
import { zoneDateKey } from "@/lib/calendarNav";
import { bookedAppointments } from "@/lib/interpreterCalendar";
import type { CalendarAppointment, CalendarBusyBlock, CalendarJobSource } from "@/lib/interpreterCalendar";
import { getIanaZone } from "@/utils/timezone";

/**
 * Everything the interpreter's calendar page keeps in state (moved out of the page unchanged): the calendar's zone, the day and
 * view being shown, the booked jobs and the private busy time.
 */
export function useInterpreterCalendar() {
  const { jobs: contextJobs } = useInterpreterJobs();
  const { currentUser } = useGlobalState();
  const interpreterId = currentUser?.id || "terp-1";
  // UTC provides a hydration-safe initial value. The persisted profile timezone
  // replaces it after mount; the calendar never blocks on that request.
  const [baseTimezone, setBaseTimezone] = useState<string>("UTC");
  const [isTimezoneLoading, setIsTimezoneLoading] = useState(true);
  const safeBaseTimezone = getIanaZone(baseTimezone);

  // The selected day, the view and the arrows are shared with the agency calendar (see useCalendarNavigation): month steps
  // are clamped (Oct 31 back a month is Sep 30), and "today" is today in the interpreter's own zone.
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const todayKey = zoneDateKey(safeBaseTimezone, currentTime);
  const nav = useCalendarNavigation({ today: todayKey });
  const { goToDate } = nav;

  const handleTimezoneChange = React.useCallback((newTz: string) => {
    const resolvedTimezone = getIanaZone(newTz);
    setBaseTimezone(resolvedTimezone);
    goToDate(zoneDateKey(resolvedTimezone));
    setIsTimezoneLoading(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`terpdesk_timezone_${interpreterId}`, newTz);
        localStorage.setItem("terpdesk_interpreter_timezone", newTz);
        const stored = localStorage.getItem("terpdesk_availability");
        const parsed = stored ? JSON.parse(stored) : {};
        parsed.baseTimezone = newTz;
        localStorage.setItem("terpdesk_availability", JSON.stringify(parsed));
      } catch {
        // Browser storage unavailable: the zone is still saved on the server by the form.
      }
    }
  }, [goToDate, interpreterId]);

  // 60-second tick for live status engine
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const landedOnToday = React.useRef(false);
  const [busyBlocks, setBusyBlocks] = useState<CalendarBusyBlock[]>([]);
  const [acceptedAppointments, setAcceptedAppointments] = useState<CalendarAppointment[]>([]);

  const reloadAvailability = React.useCallback(async () => {
    try {
      const data = await td_availability_view(interpreterId);
      if (data.profile?.timeZone) {
        const profileTimezone = getIanaZone(data.profile.timeZone);
        setBaseTimezone(profileTimezone);
        // Land on today in the profile's zone once; later reloads (after saving hours or busy time) keep the day they chose.
        if (!landedOnToday.current) {
          landedOnToday.current = true;
          goToDate(zoneDateKey(profileTimezone));
        }
      }
      if (data.busyBlocks) {
        setBusyBlocks(data.busyBlocks.map((b) => ({
          id: b.id,
          label: b.title || "Busy",
          timeZone: b.timeZone || data.profile?.timeZone || "UTC",
          isAllDay: false,
          start: b.startsAt,
          end: b.endsAt,
        })));
      }
    } catch {
      console.error("[interpreter-calendar page] operation failed");
    } finally {
      setIsTimezoneLoading(false);
    }
  }, [goToDate, interpreterId]);

  useEffect(() => {
    void reloadAvailability();
  }, [reloadAvailability]);

  useEffect(() => {
    const loadJobs = () => {
      let sourceList: CalendarJobSource[] = [];
      if (contextJobs && contextJobs.length > 0) {
        sourceList = contextJobs;
      } else {
        const storedJobs = localStorage.getItem("terpdesk_interpreter_jobs");
        if (storedJobs) {
          try {
            const parsed: unknown = JSON.parse(storedJobs);
            if (Array.isArray(parsed)) sourceList = parsed;
          } catch {
            // An unreadable copy counts as no jobs.
          }
        }
      }
      setAcceptedAppointments(bookedAppointments(sourceList));
    };

    loadJobs();
    window.addEventListener("storage", loadJobs);
    return () => window.removeEventListener("storage", loadJobs);
  }, [contextJobs]);

  return {
    interpreterId, baseTimezone, safeBaseTimezone, isTimezoneLoading, currentTime, todayKey, nav,
    busyBlocks, acceptedAppointments, handleTimezoneChange, reloadAvailability,
  };
}
