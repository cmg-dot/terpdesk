"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { CalendarView } from "@/lib/calendarNav";

const VIEWS: CalendarView[] = ["month", "week", "day"];

interface Props {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

/**
 * The Month / Week / Day switch. Memoized on purpose: the sliding pill is a framer-motion layout element, and every time one
 * re-renders it measures the page. Stepping from month to month does not touch this component, so it never pays for that.
 */
export const CalendarViewToggle = memo(function CalendarViewToggle({ view, onChange }: Props) {
  return (
    <div className="rounded-full p-1 flex w-full max-w-md relative z-10">
      {VIEWS.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`relative flex-1 text-center py-2 text-sm rounded-full outline-none transition-colors duration-200 ${view === v ? "text-white font-medium" : "text-[var(--sage)] hover:text-[var(--ink)]"}`}
        >
          {view === v && (
            <motion.div layoutId="agencyCalendarTogglePill" className="absolute inset-0 bg-[var(--forest)] rounded-full" initial={false} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
          )}
          <span className="relative z-10 capitalize">{v}</span>
        </button>
      ))}
    </div>
  );
});
