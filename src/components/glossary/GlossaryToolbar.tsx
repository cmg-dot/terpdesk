"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useSlashToFocus } from "@/hooks/useSlashToFocus";
import { GLOSSARY_SORTS, GLOSSARY_SORT_LABELS, MAX_GLOSSARY_QUERY, hasActiveGlossaryFilters } from "@/lib/glossaryFilters";
import type { GlossaryFilters, GlossarySort } from "@/lib/glossaryFilters";

interface Props {
  filters: GlossaryFilters;
  pairs: string[];
  settings: string[];
  shown: number;
  total: number;
  onChange: (patch: Partial<GlossaryFilters>) => void;
  onClear: () => void;
}

/** Search (press "/" to jump to it, Escape to clear), the language pair, setting and sort choices, and "Showing X of Y". */
export function GlossaryToolbar({ filters, pairs, settings, shown, total, onChange, onClear }: Props) {
  const search = useRef<HTMLInputElement>(null);
  useSlashToFocus(search);
  const sortLabels = GLOSSARY_SORTS.map((key) => GLOSSARY_SORT_LABELS[key]);
  const sortFromLabel = (label: string): GlossarySort => GLOSSARY_SORTS.find((key) => GLOSSARY_SORT_LABELS[key] === label) ?? "newest";

  return (
    <div className="space-y-3" data-glossary-toolbar="">
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
          maxLength={MAX_GLOSSARY_QUERY}
          placeholder="Search terms, renderings and notes"
          aria-label="Search glossary"
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
        <CustomSelect ariaLabel="Language pair" options={pairs} value={filters.pair} onChange={(pair) => onChange({ pair })} />
        <CustomSelect ariaLabel="Setting" options={settings} value={filters.setting} onChange={(setting) => onChange({ setting })} />
        <CustomSelect ariaLabel="Sort by" options={sortLabels} value={GLOSSARY_SORT_LABELS[filters.sort]} onChange={(label) => onChange({ sort: sortFromLabel(label) })} />
      </div>

      <p className="flex items-center gap-3 pl-1 text-[13px] text-[var(--sage)]" aria-live="polite" data-glossary-count="">
        Showing {shown} of {total}
        {hasActiveGlossaryFilters(filters) && (
          <button type="button" onClick={onClear} className="font-medium text-[var(--forest)] underline-offset-4 hover:underline">
            Clear filters
          </button>
        )}
      </p>
    </div>
  );
}
