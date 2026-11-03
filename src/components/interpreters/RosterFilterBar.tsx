"use client";

import { useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import type { DropdownOption } from "@/lib/dropdown";
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

const EMAIL_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All" },
  { value: "real", label: "Real email" },
  { value: "placeholder", label: "Placeholder (no email on file)" },
];

const ACCOUNT_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All" },
  { value: "registered", label: "Registered app user" },
  { value: "shadow", label: "Shadow / external" },
];

const Column = ({ children }: { children: React.ReactNode }) => <div className="min-w-[160px] flex-1">{children}</div>;

/** Email status, Account status and Credentials filters for the roster, with a result count and a way to clear them. */
export const RosterFilterBar = ({ filters, onChange, people, shown, total }: Props) => {
  const active = countActiveFilters(filters);
  const choices = useMemo(() => credentialChoices(people, filters), [people, filters]);

  return (
    <section aria-label="Filter the roster" className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <Column>
          <Dropdown
            id="filter-email"
            label="Email status"
            layout="stacked"
            options={EMAIL_OPTIONS}
            value={filters.email}
            onChange={(email) => onChange({ ...filters, email: email as EmailFilter })}
          />
        </Column>
        <Column>
          <Dropdown
            id="filter-account"
            label="Account status"
            layout="stacked"
            options={ACCOUNT_OPTIONS}
            value={filters.account}
            onChange={(account) => onChange({ ...filters, account: account as AccountFilter })}
          />
        </Column>
        <Column>
          <Dropdown
            id="filter-credentials"
            label="Credentials"
            layout="stacked"
            options={choices}
            value={credentialChoice(filters)}
            onChange={(choice) => onChange(withCredentialChoice(filters, choice))}
          />
        </Column>
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
