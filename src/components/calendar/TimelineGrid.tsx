"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { dayWindow, layoutBusy, layoutRow, nowPercent } from "@/lib/resourceTimeline";
import type { DayWindow } from "@/lib/resourceTimeline";
import type { InterpreterDayView, TimelineBusy, TimelineInterpreter, TimelineJob } from "@/lib/interpreterDayView";
import { LANE_HEIGHT, TimelineJobBlock } from "@/components/calendar/TimelineJobBlock";
import { TimelineBusyBlock } from "@/components/calendar/TimelineBusyBlock";

/** Width of one hour on the axis. Fixed on purpose: a phone scrolls the day sideways, it never squeezes the hours. */
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

/** The small line under a name: what they are doing, or why we can't tell. */
export const rowCaption = (person: TimelineInterpreter, jobCount: number, busyCount: number): string => {
  const parts: string[] = [];
  if (!person.onRoster) parts.push("Not on roster");
  else if (!person.active) parts.push("Archived");
  if (jobCount > 0) parts.push(`${jobCount} ${jobCount === 1 ? "job" : "jobs"}`);
  else if (person.active && person.onRoster) {
    // "Free" is only honest when the interpreter shares their calendar with the agency.
    parts.push(!person.sharesAvailability ? "Availability not shared" : busyCount > 0 ? "Busy part of the day" : "Free all day");
  }
  return parts.join(" · ");
};

const RowLabel = ({ person, caption }: { person: TimelineInterpreter; caption: string }) => (
  <div className="sticky left-0 z-10 flex w-[var(--label-w)] flex-none flex-col justify-center border-r border-gray-200 bg-white px-3 py-2 shadow-[2px_0_4px_-3px_rgba(0,0,0,0.25)]">
    {person.onRoster ? (
      <Link href={`/interpreters/${person.id}`} className="truncate text-[13px] font-medium text-[var(--ink)] hover:underline">{person.name}</Link>
    ) : (
      <span className="truncate text-[13px] font-medium text-[var(--ink)]">{person.name}</span>
    )}
    <span className="truncate text-[11px] text-gray-500">{caption}</span>
  </div>
);

const groupBy = <T extends { interpreterId: string }>(items: readonly T[]): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.interpreterId, [...(map.get(item.interpreterId) ?? []), item]);
  return map;
};

/**
 * The resource timeline: a sticky hour ruler across the top, one row per interpreter, and each job drawn as a block where
 * it falls on the day, over a greyed "Busy" layer for time the interpreter shares as busy.
 *
 * Layout rule: every width here is explicit (label column + 24 fixed-width hours), and the frame around it is the ONLY
 * thing that scrolls. So on a phone the day scrolls smoothly sideways at full size, the name column stays pinned on the
 * left, and the ruler stays pinned at the top.
 */
export const TimelineGrid = ({ view, people, nowMs, busy }: Props) => {
  const window: DayWindow = useMemo(() => dayWindow(view.date, view.zone), [view.date, view.zone]);
  const trackWidth = window.hours.length * HOUR_PX;
  const now = nowPercent(window, nowMs);
  const scroller = useRef<HTMLDivElement>(null);
  const jobsByPerson = useMemo<Map<string, TimelineJob[]>>(() => groupBy(view.jobs), [view.jobs]);
  const busyByPerson = useMemo<Map<string, TimelineBusy[]>>(() => groupBy(view.busy), [view.busy]);

  // Open on the working day: an hour before now when looking at today, otherwise the morning.
  useEffect(() => {
    if (!scroller.current) return;
    const hours = now === null ? FIRST_VISIBLE_HOUR : Math.max(0, Math.floor((nowMs - window.startMs) / 3_600_000 - 1));
    scroller.current.scrollLeft = hours * HOUR_PX;
    // Only when a different day is shown: the minute-by-minute clock must not drag the view around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.date]);

  return (
    <div
      ref={scroller}
      role="region"
      aria-label="Interpreter schedule, scrolls sideways"
      tabIndex={0}
      aria-busy={busy}
      data-timeline-date={view.date}
      className={`max-h-[70dvh] w-full max-w-full overflow-auto overscroll-x-contain rounded-2xl border border-gray-200 bg-white transition-opacity [-webkit-overflow-scrolling:touch] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B32] ${busy ? "opacity-60" : ""}`}
    >
      <div data-timeline-canvas className="[--label-w:7.5rem] sm:[--label-w:12rem]" style={{ width: `calc(var(--label-w) + ${trackWidth}px)` }}>
        <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-white">
          <div className="sticky left-0 z-30 flex w-[var(--label-w)] flex-none items-center border-r border-gray-200 bg-white px-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--sage)]">
            Interpreter
          </div>
          <div className="relative h-10 flex-none" style={{ width: trackWidth }} aria-hidden="true">
            {window.hours.map((hour, index) => (
              <span key={hour.ms} className="absolute top-0 flex h-full items-center border-l border-gray-200 pl-1.5 text-[11px] text-gray-500" style={{ left: index * HOUR_PX }}>
                {hour.label}
              </span>
            ))}
          </div>
        </div>

        {people.map((person) => {
          const layout = layoutRow(jobsByPerson.get(person.id) ?? [], window);
          const busyBlocks = layoutBusy(busyByPerson.get(person.id) ?? [], window);
          return (
            <div key={person.id} data-interpreter-row={person.id} className="flex border-b border-gray-100 last:border-b-0">
              <RowLabel person={person} caption={rowCaption(person, layout.blocks.length, busyBlocks.length)} />
              <div className="relative flex-none" style={{ width: trackWidth, height: layout.laneCount * LANE_HEIGHT + 8, ...hourLines }}>
                {busyBlocks.map((block) => (
                  <TimelineBusyBlock key={block.leftPct} block={block} />
                ))}
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
