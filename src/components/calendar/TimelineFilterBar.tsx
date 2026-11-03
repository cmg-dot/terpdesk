"use client";

import { buildFilterOptions, countTimelineFilters, NO_TIMELINE_FILTERS } from "@/lib/timelineFilters";
import type { FilterFacts, TimelineFilters } from "@/lib/timelineFilters";

interface Props {
  /** Whose tags make up the choices: the roster people the timeline can show. */
  people: readonly FilterFacts[];
  filters: TimelineFilters;
  onChange: (next: TimelineFilters) => void;
}

const selectClass =
  "min-w-0 max-w-full flex-1 rounded-full border-none bg-[#F4F3EF] py-2 pl-3 pr-8 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#0B3B32] sm:flex-none sm:max-w-[16rem]";

interface FilterSelectProps {
  id: string;
  label: string;
  anyLabel: string;
  people: readonly FilterFacts[];
  field: "credentials" | "areas";
  value: string;
  onPick: (value: string) => void;
}

const FilterSelect = ({ id, label, anyLabel, people, field, value, onPick }: FilterSelectProps) => {
  const { options, current } = buildFilterOptions(people, field, value);
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-gray-700">
      <span className="flex-none">{label}</span>
      <select id={id} value={current} onChange={(e) => onPick(e.target.value)} className={selectClass}>
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
};

/** Credentials and Tags / Location dropdowns for the Interpreter View, with a way to clear them. */
export const TimelineFilterBar = ({ people, filters, onChange }: Props) => {
  const active = countTimelineFilters(filters);
  return (
    <div role="group" aria-label="Filter interpreters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
      <FilterSelect
        id="timeline-filter-credential"
        label="Credentials"
        anyLabel="All credentials"
        people={people}
        field="credentials"
        value={filters.credential}
        onPick={(credential) => onChange({ ...filters, credential })}
      />
      <FilterSelect
        id="timeline-filter-area"
        label="Tags / Location"
        anyLabel="All locations"
        people={people}
        field="areas"
        value={filters.area}
        onPick={(area) => onChange({ ...filters, area })}
      />
      {active > 0 && (
        <button type="button" onClick={() => onChange(NO_TIMELINE_FILTERS)} className="self-start text-sm font-medium text-[#0B3B32] hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
};
