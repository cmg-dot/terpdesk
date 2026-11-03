"use client";

import { useMemo } from "react";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { countActiveFilters, credentialChoice, credentialChoices, NO_ROSTER_FILTERS, withCredentialChoice } from "@/lib/rosterFilters";
import type { AccountFilter, EmailFilter, FilterableInterpreter, RosterFilters } from "@/lib/rosterFilters";

interface Props {
  filters: RosterFilters;
  onChange: (next: RosterFilters) => void;
  /** The whole roster (not just who is showing), so the Credentials list is complete whatever else is filtered. */
  people: readonly FilterableInterpreter[];
  shown: number;
  total: number;
}

const selectClass =
  "w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#0B3B32] focus:ring-2 focus:ring-[#0B3B32]/40";

const Labelled = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div className="min-w-[160px] flex-1 space-y-1">
    <label htmlFor={id} className="block text-[12px] font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

/** Email status, Account status and Credentials filters for the roster, with a result count and a way to clear them. */
export const RosterFilterBar = ({ filters, onChange, people, shown, total }: Props) => {
  const active = countActiveFilters(filters);
  const set = (patch: Partial<RosterFilters>) => onChange({ ...filters, ...patch });
  const choices = useMemo(() => credentialChoices(people, filters), [people, filters]);

  return (
    <section aria-label="Filter the roster" className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <Labelled id="filter-email" label="Email status">
          <select id="filter-email" value={filters.email} onChange={(e) => set({ email: e.target.value as EmailFilter })} className={selectClass}>
            <option value="all">All</option>
            <option value="real">Real email</option>
            <option value="placeholder">Placeholder (no email on file)</option>
          </select>
        </Labelled>
        <Labelled id="filter-account" label="Account status">
          <select id="filter-account" value={filters.account} onChange={(e) => set({ account: e.target.value as AccountFilter })} className={selectClass}>
            <option value="all">All</option>
            <option value="registered">Registered app user</option>
            <option value="shadow">Shadow / external</option>
          </select>
        </Labelled>
        <div className="min-w-[160px] flex-1">
          <FilterDropdown
            id="filter-credentials"
            label="Credentials"
            layout="stacked"
            options={choices}
            value={credentialChoice(filters)}
            onChange={(choice) => onChange(withCredentialChoice(filters, choice))}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-gray-600">
        <p role="status">
          Showing <strong>{shown}</strong> of <strong>{total}</strong> {total === 1 ? "interpreter" : "interpreters"}
          {active > 0 && ` · ${active} ${active === 1 ? "filter" : "filters"} on`}
        </p>
        {active > 0 && (
          <button type="button" onClick={() => onChange(NO_ROSTER_FILTERS)} className="font-medium text-[#0B3B32] hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
};
