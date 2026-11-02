"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { dayWindow, layoutRow, nowPercent } from "@/lib/resourceTimeline";
import type { DayWindow } from "@/lib/resourceTimeline";
import type { InterpreterDayView, TimelineInterpreter, TimelineJob } from "@/lib/interpreterDayView";
import { LANE_HEIGHT, TimelineJobBlock } from "@/components/calendar/TimelineJobBlock";

/** Width of one hour on the axis. The day is wider than most screens, so the grid scrolls sideways. */
export const HOUR_PX = 88;
const FIRST_VISIBLE_HOUR = 7;

interface Props {
  view: InterpreterDayView;
  /** The rows to draw, already filtered and sorted. */
  people: TimelineInterpreter[];
  nowMs: number;
  busy: boolean;
}

const hourLines = {
  backgroundImage: "linear-gradient(to right, #E5E7EB 1px, transparent 1px)",
  backgroundSize: `${HOUR_PX}px 100%`,
};

const RowLabel = ({ person, jobCount }: { person: TimelineInterpreter; jobCount: number }) => (
  <div className="sticky left-0 z-10 flex w-36 shrink-0 flex-col justify-center border-r border-gray-200 bg-white px-3 py-2 sm:w-48">
    {person.onRoster ? (
      <Link href={`/interpreters/${person.id}`} className="truncate text-[13px] font-medium text-[var(--ink)] hover:underline">{person.name}</Link>
    ) : (
      <span className="truncate text-[13px] font-medium text-[var(--ink)]">{person.name}</span>
    )}
    <span className="truncate text-[11px] text-gray-500">
      {[!person.onRoster ? "Not on roster" : !person.active ? "Archived" : null, jobCount === 0 ? (person.active && person.onRoster ? "Free all day" : null) : `${jobCount} ${jobCount === 1 ? "job" : "jobs"}`].filter(Boolean).join(" · ")}
    </span>
  </div>
);

/**
 * The resource timeline: a sticky hour ruler across the top, one row per interpreter, and each job drawn as a block where
 * it falls on the day. Overlapping jobs for one person stack in lanes. Scrolls sideways (and down) inside its own frame.
 */
export const TimelineGrid = ({ view, people, nowMs, busy }: Props) => {
  const window: DayWindow = useMemo(() => dayWindow(view.date, view.zone), [view.date, view.zone]);
  const trackWidth = window.hours.length * HOUR_PX;
  const now = nowPercent(window, nowMs);
  const scroller = useRef<HTMLDivElement>(null);

  const jobsByPerson = useMemo(() => {
    const map = new Map<string, TimelineJob[]>();
    for (const job of view.jobs) map.set(job.interpreterId, [...(map.get(job.interpreterId) ?? []), job]);
    return map;
  }, [view.jobs]);

  // Open on the working day: an hour before now when looking at today, otherwise the morning.
  useEffect(() => {
    if (!scroller.current) return;
    const hours = now === null ? FIRST_VISIBLE_HOUR : Math.max(0, Math.floor(((nowMs - window.startMs) / 3_600_000) - 1));
    scroller.current.scrollLeft = hours * HOUR_PX;
    // Only when a different day is shown: the minute-by-minute clock must not drag the view around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.date]);

  return (
    <div
      ref={scroller}
      aria-busy={busy}
      data-timeline-date={view.date}
      className={`max-h-[70vh] overflow-auto rounded-2xl border border-gray-200 bg-white transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <div style={{ width: "max-content", minWidth: "100%" }}>
        <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-white">
          <div className="sticky left-0 z-30 flex w-36 shrink-0 items-center border-r border-gray-200 bg-white px-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--sage)] sm:w-48">
            Interpreter
          </div>
          <div className="relative h-10 shrink-0" style={{ width: trackWidth }} aria-hidden="true">
            {window.hours.map((hour, index) => (
              <span key={hour.ms} className="absolute top-0 flex h-full items-center border-l border-gray-200 pl-1.5 text-[11px] text-gray-500" style={{ left: index * HOUR_PX }}>
                {hour.label}
              </span>
            ))}
          </div>
        </div>

        {people.map((person) => {
          const jobs = jobsByPerson.get(person.id) ?? [];
          const layout = layoutRow(jobs, window);
          return (
            <div key={person.id} data-interpreter-row={person.id} className="flex border-b border-gray-100 last:border-b-0">
              <RowLabel person={person} jobCount={layout.blocks.length} />
              <div className="relative shrink-0" style={{ width: trackWidth, height: layout.laneCount * LANE_HEIGHT + 8, ...hourLines }}>
                {now !== null && <span aria-hidden="true" data-now-line className="absolute inset-y-0 z-10 w-px bg-red-500/70" style={{ left: `${now}%` }} />}
                {layout.blocks.map((block) => (
                  <TimelineJobBlock key={block.job.offerId} block={block} zone={view.zone} nowMs={nowMs} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
