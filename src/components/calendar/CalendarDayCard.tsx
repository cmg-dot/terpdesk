"use client";

import { memo } from "react";
import Link from "next/link";
import { HappeningNowBadge } from "@/components/HappeningNowBadge";
import { CANCELLED_CARD, CANCELLED_TITLE, CancelledBadge } from "@/components/calendar/CalendarStatusFilter";
import { formatAgencyTimeRange } from "@/lib/agencyTime";
import type { DayCard } from "@/lib/calendarDayIndex";

/** Text colour for a request status on the calendar, so state reads at a glance. */
const statusTextClass = (status: string | undefined, isHappening: boolean, isPast: boolean): string => {
  if (isHappening) return "text-emerald-100";
  if (isPast) return "text-gray-500";
  const s = (status || "").toLowerCase();
  if (s.includes("replacement")) return "text-red-700";
  if (s.includes("awaiting") || s.includes("offer") || s.includes("pending")) return "text-blue-700";
  if (s.includes("partial")) return "text-amber-700";
  if (s.includes("cancel")) return "text-gray-500";
  if (s.includes("staffed") || s.includes("booked") || s.includes("assigned")) return "text-emerald-800";
  return "text-gray-700";
};

/** Hover that answers at once: a 1px lift and a soft shadow, quick to arrive and quick to leave. */
const SNAPPY = "transition-[background-color,box-shadow,transform,opacity] duration-100 ease-out hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm";

export type CardVariant = "month" | "week" | "day";

interface Props {
  card: DayCard;
  /** L live now, P finished, U upcoming (see dayPhases). */
  phase: string;
  variant: CardVariant;
}

const LiveDot = ({ compact }: { compact: boolean }) => (
  <div className={`flex items-center gap-1 ${compact ? "mb-0.5" : "mb-1"}`}>
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
    </span>
    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">Live now</span>
  </div>
);

/** One appointment on the month, week or day grid. Memoized: it only repaints when its card or its live / finished state changes. */
export const CalendarDayCard = memo(function CalendarDayCard({ card, phase, variant }: Props) {
  const { request: req, cancelled: isCancelled, startsAt, endsAt } = card;
  const isHappening = phase === "L";
  const isPast = phase === "P";
  const timeStr = formatAgencyTimeRange(startsAt, endsAt);
  const href = `/requests/${req.id}`;

  if (variant === "day") {
    const org = req.requester?.org || req.data?.intake?.program || "General";
    return (
      <Link
        href={href}
        className={`block rounded-xl p-4 sm:p-5 ${SNAPPY} ${
          isCancelled ? CANCELLED_CARD.day : isHappening ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400 hover:bg-emerald-700" : isPast ? "bg-slate-50 border border-gray-200 text-gray-500 hover:bg-gray-100" : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isHappening && <HappeningNowBadge size="sm" />}
              <h3 className={`font-semibold text-base ${isCancelled ? CANCELLED_TITLE : ""}`}>{req.title || "Request"}</h3>
            </div>
            <div className={`text-sm ${isHappening ? "text-emerald-100" : isPast ? "text-gray-500" : "text-[var(--ink)]"}`}>{timeStr}</div>
            <div className={`text-xs ${isHappening ? "text-emerald-200" : isPast ? "text-gray-400" : "text-[var(--sage)]"}`}>
              Organization: <span className="font-medium">{org}</span>
            </div>
          </div>
          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
            <span className={`rounded-full px-3 py-0.5 text-xs font-medium capitalize ${isCancelled || isPast ? "bg-gray-200 text-gray-600" : isHappening ? "bg-emerald-500 text-white" : "bg-[#E5F0EB] text-[#0A3D31]"}`}>
              {isCancelled && req.isVoided ? "Void" : req.status}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  const month = variant === "month";
  const shape = month ? "rounded-md p-1.5" : "rounded-lg p-2.5";
  const live = month ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400 hover:bg-emerald-700" : "bg-emerald-600 text-white shadow-md ring-1 ring-emerald-400 hover:bg-emerald-700";
  const tight = month ? " leading-tight" : "";
  return (
    <Link
      href={href}
      className={`block ${shape} text-xs ${SNAPPY} ${
        isCancelled ? CANCELLED_CARD[variant] : isHappening ? live : isPast ? "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200" : "bg-[#E5F0EB] text-[#0A3D31] border border-[#CDE0D8] hover:bg-[#D5E6DF]"
      }`}
    >
      {isHappening && <LiveDot compact={month} />}
      <div className="flex flex-col gap-1 p-0.5">
        <div className={`font-medium text-sm truncate${tight} ${isCancelled ? CANCELLED_TITLE : ""}`}>{req.title || "Request"}</div>
        <div className={`text-xs truncate${tight} ${isHappening ? "text-emerald-100" : isPast ? "text-gray-400" : "text-gray-600"}`}>{timeStr}</div>
        <div className={`text-[11px] font-semibold capitalize truncate${tight} text-left ${statusTextClass(req.status, isHappening, isPast)}`}>
          {isCancelled ? <CancelledBadge voided={Boolean(req.isVoided)} /> : req.status}
        </div>
      </div>
    </Link>
  );
});
