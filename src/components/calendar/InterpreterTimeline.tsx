"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TimelineFilterBar } from "@/components/calendar/TimelineFilterBar";
import { TimelineGrid } from "@/components/calendar/TimelineGrid";
import { useInterpreterDayView } from "@/hooks/useInterpreterDayView";
import { useTimelineFilters } from "@/hooks/useTimelineFilters";
import { countTimelineFilters, matchesTimelineFilters, NO_TIMELINE_FILTERS } from "@/lib/timelineFilters";

interface Props {
  /** The selected day, yyyy-MM-dd. */
  dateKey: string;
  /** The page's once-a-minute clock, so the "now" line and live/past colours stay current. */
  nowMs: number;
}

const LEGEND: { swatch: string; label: string }[] = [
  { swatch: "bg-[var(--mint-pale)] border-[#CDE0D8]", label: "Booked" },
  { swatch: "bg-emerald-600 border-emerald-600", label: "Happening now" },
  { swatch: "bg-amber-50 border-amber-300", label: "Needs attention" },
  { swatch: "bg-gray-100 border-gray-200", label: "Finished" },
  { swatch: "bg-gray-300 border-gray-400", label: "Busy (time the interpreter shares)" },
];

/**
 * The Interpreter View: the agency's roster down the side, the selected day across the top, and each interpreter's
 * booked jobs as blocks in their row. Fetches only this day (see getInterpreterDayView); the Job View is untouched.
 */
export const InterpreterTimeline = ({ dateKey, nowMs }: Props) => {
  const { view, loading, error, reload } = useInterpreterDayView(dateKey);
  const [search, setSearch] = useState("");
  const [onlyWorking, setOnlyWorking] = useState(false);
  const [filters, setFilters] = useTimelineFilters();

  const jobCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of view?.jobs ?? []) counts.set(job.interpreterId, (counts.get(job.interpreterId) ?? 0) + 1);
    return counts;
  }, [view]);

  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (view?.interpreters ?? []).filter((person) => {
      const working = (jobCounts.get(person.id) ?? 0) > 0;
      // Archived people and people no longer on the roster only appear when they actually have work that day.
      if (!working && (!person.active || !person.onRoster)) return false;
      if (onlyWorking && !working) return false;
      if (!matchesTimelineFilters(person, filters)) return false;
      return query === "" || person.name.toLowerCase().includes(query);
    });
  }, [view, jobCounts, search, onlyWorking, filters]);

  const workingCount = jobCounts.size;
  const filtersOn = countTimelineFilters(filters) > 0;
  // The dropdown choices come from everyone the timeline could list, so picking one never shrinks the other's choices.
  const filterPeople = useMemo(() => (view?.interpreters ?? []).filter((person) => person.onRoster && person.active), [view]);

  return (
    <section aria-label="Interpreter schedule" className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="timeline-search" className="sr-only">Find an interpreter</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            id="timeline-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an interpreter"
            autoComplete="off"
            className="w-full rounded-full border-none bg-[#F4F3EF] py-2.5 pl-9 pr-4 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-[var(--forest)]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onlyWorking} onChange={(e) => setOnlyWorking(e.target.checked)} className="h-4 w-4 accent-[var(--forest)]" />
          Only interpreters with a job this day
        </label>
      </div>

      <TimelineFilterBar people={filterPeople} filters={filters} onChange={setFilters} />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px] text-[var(--sage)]">
        <p role="status">
          {view
            ? `${view.interpreters.filter((p) => p.active && p.onRoster).length} interpreters on the roster · ${view.jobs.length} ${view.jobs.length === 1 ? "booking" : "bookings"} for ${workingCount} ${workingCount === 1 ? "interpreter" : "interpreters"}`
            : "Loading…"}
          {view && (filtersOn || search || onlyWorking) && ` · showing ${people.length}`}
          {view && ` · times in ${view.zone.replace("_", " ")}`}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Colour key">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-sm border ${item.swatch}`} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12px] text-gray-500 sm:hidden">Swipe sideways to see the whole day. Names stay in place.</p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={reload} className="rounded-full border border-red-300 bg-white px-4 py-1.5 font-medium hover:bg-red-100">Try again</button>
        </div>
      )}

      {!view && loading && !error && (
        <div role="status" className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-[var(--sage)]">Loading the interpreter schedule…</div>
      )}

      {view && (
        <>
          {view.jobs.length === 0 && !loading && (
            <p className="text-sm text-[var(--sage)]">No interpreter is booked on this day.</p>
          )}
          {people.length === 0 ? (
            <div role="status" data-empty-timeline className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-[var(--sage)]">
              {filtersOn || search || onlyWorking ? (
                <>
                  <p className="font-medium text-[var(--ink)]">No interpreters match these filters</p>
                  <p className="mt-1">Try a different credential or location, or clear the filters to see everyone.</p>
                  {filtersOn && (
                    <button type="button" onClick={() => setFilters(NO_TIMELINE_FILTERS)} className="mt-4 rounded-full border border-gray-300 bg-white px-4 py-1.5 font-medium text-[var(--forest)] hover:bg-gray-50">
                      Clear filters
                    </button>
                  )}
                </>
              ) : (
                "No interpreters on the roster yet."
              )}
            </div>
          ) : (
            <TimelineGrid view={view} people={people} nowMs={nowMs} busy={loading} />
          )}
        </>
      )}
    </section>
  );
};
