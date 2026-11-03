"use client";

import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { withAnyOption } from "@/lib/filterDropdown";
import { buildFilterOptions, countTimelineFilters, NO_TIMELINE_FILTERS } from "@/lib/timelineFilters";
import type { FilterFacts, TimelineFilters } from "@/lib/timelineFilters";

interface Props {
  /** Whose tags make up the choices: the roster people the timeline can show. */
  people: readonly FilterFacts[];
  filters: TimelineFilters;
  onChange: (next: TimelineFilters) => void;
}

/** Credentials and Tags / Location dropdowns for the Interpreter View, with a way to clear them. */
export const TimelineFilterBar = ({ people, filters, onChange }: Props) => {
  const active = countTimelineFilters(filters);
  const credentials = buildFilterOptions(people, "credentials", filters.credential);
  const areas = buildFilterOptions(people, "areas", filters.area);
  return (
    <div role="group" aria-label="Filter interpreters" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
      <FilterDropdown
        id="timeline-filter-credential"
        label="Credentials"
        options={withAnyOption("All credentials", credentials.options)}
        value={credentials.current}
        onChange={(credential) => onChange({ ...filters, credential })}
        className="flex-1 sm:w-56 sm:flex-none"
      />
      <FilterDropdown
        id="timeline-filter-area"
        label="Tags / Location"
        options={withAnyOption("All locations", areas.options)}
        value={areas.current}
        onChange={(area) => onChange({ ...filters, area })}
        className="flex-1 sm:w-52 sm:flex-none"
      />
      {active > 0 && (
        <button type="button" onClick={() => onChange(NO_TIMELINE_FILTERS)} className="self-start text-sm font-medium text-[#0B3B32] hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
};
