"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { useSlashToFocus } from "@/hooks/useSlashToFocus";
import type { CycleView } from "@/lib/ceu";
import {
  ALL_CYCLES, CEU_FOCUSES, CEU_FOCUS_LABELS, CEU_SORTS, CEU_SORT_LABELS, MAX_CEU_QUERY, NO_CYCLE, cycleChoiceLabel, hasActiveCeuFilters,
} from "@/lib/ceuFilters";
import type { CeuFilters, CeuFocus, CeuSort } from "@/lib/ceuFilters";

interface Props {
  filters: CeuFilters;
  cycles: CycleView[];
  shown: number;
  total: number;
  onChange: (patch: Partial<CeuFilters>) => void;
  onClear: () => void;
}

const SORT_CHOICES = CEU_SORTS.map((key) => ({ value: key, label: CEU_SORT_LABELS[key] }));
const FOCUS_CHOICES = CEU_FOCUSES.map((key) => ({ value: key, label: CEU_FOCUS_LABELS[key] }));

/** Search (press "/" to jump to it, Escape to clear), the cycle, ethics and PPO focus and sort choices, and "Showing X of Y". */
export function CeuToolbar({ filters, cycles, shown, total, onChange, onClear }: Props) {
  const search = useRef<HTMLInputElement>(null);
  useSlashToFocus(search);
  const cycleChoices = [
    { value: ALL_CYCLES, label: "All cycles" },
    ...cycles.map((c) => ({ value: c.id, label: cycleChoiceLabel(c) })),
    { value: NO_CYCLE, label: "No cycle" },
  ];

  return (
    <div className="space-y-3" data-ceu-toolbar="">
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
          maxLength={MAX_CEU_QUERY}
          placeholder="Search titles, providers and categories"
          aria-label="Search CEU log"
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Dropdown id="ceu-filter-cycle" ariaLabel="Cycle" variant="form" className="w-full" value={filters.cycle} options={cycleChoices} onChange={(cycle) => onChange({ cycle })} />
        <Dropdown id="ceu-filter-focus" ariaLabel="Focus" variant="form" className="w-full" value={filters.focus} options={FOCUS_CHOICES} onChange={(focus) => onChange({ focus: focus as CeuFocus })} />
        <Dropdown id="ceu-filter-sort" ariaLabel="Sort by" variant="form" className="w-full" value={filters.sort} options={SORT_CHOICES} onChange={(sort) => onChange({ sort: sort as CeuSort })} />
      </div>

      <p className="flex items-center gap-3 pl-1 text-[13px] text-[var(--sage)]" aria-live="polite" data-ceu-count="">
        Showing {shown} of {total}
        {hasActiveCeuFilters(filters) && (
          <button type="button" onClick={onClear} className="font-medium text-[var(--forest)] underline-offset-4 hover:underline">
            Clear filters
          </button>
        )}
      </p>
    </div>
  );
}
