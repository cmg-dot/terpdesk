"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { civilDate, civilKey } from "@/lib/agencyTime";
import { stepDateKey } from "@/lib/calendarNav";
import type { CalendarView } from "@/lib/calendarNav";
import { parseDateKey } from "@/lib/dateTimePicker";

interface Options {
  /** Today (yyyy-MM-dd) in the calendar's own zone; "Today" and the first screen use it. */
  today: string;
  initialView?: CalendarView;
}

interface Position {
  key: string;
  /** Which way the last move went: 1 later, -1 earlier, 0 no move (a view change); the slide animation reads it. */
  direction: -1 | 0 | 1;
}

export interface CalendarNavigation {
  /** The selected day, yyyy-MM-dd. */
  dateKey: string;
  /** The same day as a civil Date (local noon): only its year / month / day are meaningful. */
  date: Date;
  view: CalendarView;
  direction: -1 | 0 | 1;
  setView: (view: CalendarView) => void;
  /** One `unit` later (the current view unless a unit is given), month steps clamped to the month's last day. */
  next: (unit?: CalendarView) => void;
  prev: (unit?: CalendarView) => void;
  goToToday: () => void;
  /** Jump to any day: a yyyy-MM-dd key or a Date (read by its local year / month / day). A bad value is ignored. */
  goToDate: (target: Date | string) => void;
}

/** The selected day and view of a calendar, shared by the agency and interpreter calendars. */
export const useCalendarNavigation = ({ today, initialView = "month" }: Options): CalendarNavigation => {
  const [position, setPosition] = useState<Position>(() => ({ key: today, direction: 0 }));
  const [view, setViewState] = useState<CalendarView>(initialView);
  const latest = useRef({ today, view });
  latest.current = { today, view };

  const moveTo = useCallback((resolve: (current: string) => string) => {
    setPosition((current) => {
      const key = resolve(current.key);
      if (key === current.key || !parseDateKey(key)) return current;
      return { key, direction: key > current.key ? 1 : -1 };
    });
  }, []);

  const next = useCallback((unit?: CalendarView) => moveTo((key) => stepDateKey(key, unit ?? latest.current.view, 1)), [moveTo]);
  const prev = useCallback((unit?: CalendarView) => moveTo((key) => stepDateKey(key, unit ?? latest.current.view, -1)), [moveTo]);
  const goToToday = useCallback(() => moveTo(() => latest.current.today), [moveTo]);
  const goToDate = useCallback((target: Date | string) => moveTo(() => (typeof target === "string" ? target : civilKey(target))), [moveTo]);
  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    setPosition((current) => (current.direction === 0 ? current : { ...current, direction: 0 }));
  }, []);

  const date = useMemo(() => civilDate(position.key), [position.key]);
  return { dateKey: position.key, date, view, direction: position.direction, setView, next, prev, goToToday, goToDate };
};
