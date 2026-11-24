"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { useSlashToFocus } from "@/hooks/useSlashToFocus";
import { JOB_SORTS, JOB_SORT_LABELS, JOB_TABS, JOB_TAB_LABELS, MAX_JOB_QUERY, hasActiveJobFilters } from "@/lib/personalJobFilters";
import type { JobSort, JobTabCounts, PersonalJobFilters } from "@/lib/personalJobFilters";

interface Props {
  filters: PersonalJobFilters;
  counts: JobTabCounts;
  settings: string[];
  shown: number;
  onChange: (patch: Partial<PersonalJobFilters>) => void;
  onClear: () => void;
}

/** Search (press "/" to jump to it, Escape to clear), the All / Upcoming / Completed tabs, the setting and sort choices, and "Showing X of Y". */
export function MyWorkToolbar({ filters, counts, settings, shown, onChange, onClear }: Props) {
  const search = useRef<HTMLInputElement>(null);
  const { reduce, transition } = useHoursMotion();
  useSlashToFocus(search);
  const sortLabels = JOB_SORTS.map((key) => JOB_SORT_LABELS[key]);
  const sortFromLabel = (label: string): JobSort => JOB_SORTS.find((key) => JOB_SORT_LABELS[key] === label) ?? "newest";

  return (
    <div className="space-y-3" data-my-work-toolbar="">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sage)]" aria-hidden="true" />
        <input
          ref={search}
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (filters.query) onChange({ query: "" });
              else event.currentTarget.blur();
            }
          }}
          maxLength={MAX_JOB_QUERY}
          placeholder="Search label or setting"
          aria-label="Search personal jobs"
          className="h-11 w-full rounded-full border border-[var(--banner-edge)] bg-white pl-11 pr-12 text-[14px] text-[var(--ink)] placeholder:text-[var(--placeholder)] focus:border-[var(--forest)] focus:outline-none focus:ring-2 focus:ring-[var(--forest)]/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.query ? (
          <button type="button" onClick={() => { onChange({ query: "" }); search.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--sage)] hover:bg-[var(--tint)]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--banner-edge)] bg-[var(--canvas)] px-1.5 text-[12px] font-medium text-[var(--sage)] md:flex">
            /
          </kbd>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Show personal jobs" className="flex flex-wrap gap-1 rounded-3xl bg-[var(--surface)] p-1 lg:w-auto lg:rounded-full">
          {JOB_TABS.map((tab) => {
            const active = filters.tab === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                data-tab={tab}
                onClick={() => onChange({ tab })}
                className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] sm:min-h-9 sm:px-4 font-medium transition-colors lg:flex-none ${active ? "text-white" : "text-[var(--sage)] hover:text-[var(--ink)]"}`}
              >
                {active && <motion.span layoutId="my-work-tab" transition={reduce ? { duration: 0 } : transition(0.2)} className="absolute inset-0 rounded-full bg-[var(--pill)] shadow-sm" />}
                <span className="relative">{JOB_TAB_LABELS[tab]}</span>
                <span className="relative font-normal opacity-80">{counts[tab]}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[28rem]">
          <CustomSelect ariaLabel="Setting" options={settings} value={filters.setting} onChange={(setting) => onChange({ setting })} />
          <CustomSelect ariaLabel="Sort by" options={sortLabels} value={JOB_SORT_LABELS[filters.sort]} onChange={(label) => onChange({ sort: sortFromLabel(label) })} />
        </div>
      </div>

      <p className="flex items-center gap-3 pl-1 text-[13px] text-[var(--sage)]" aria-live="polite" data-my-work-count="">
        Showing {shown} of {counts[filters.tab]}
        {hasActiveJobFilters(filters) && (
          <button type="button" onClick={onClear} className="font-medium text-[var(--forest)] underline-offset-4 hover:underline">
            Clear filters
          </button>
        )}
      </p>
    </div>
  );
}
