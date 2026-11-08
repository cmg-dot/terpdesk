"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import type { DropdownOption } from "@/lib/dropdown";
import { DEFAULT_FILTERS, countActiveFilters } from "@/lib/hoursReviewFilter";
import type { HoursFilters, RangeFilter, SignatureFilter, StatusFilter } from "@/lib/hoursReviewFilter";

const SEARCH_DELAY_MS = 300;

const STATUS_LABELS: Record<StatusFilter, string> = {
  awaiting: "Awaiting review",
  correction: "Correction requested",
  approved: "Approved",
  all: "All statuses",
};
const STATUS_ORDER: readonly StatusFilter[] = ["awaiting", "correction", "approved", "all"];

const RANGE_OPTIONS: DropdownOption[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const SIGNATURE_OPTIONS: DropdownOption[] = [
  { value: "any", label: "Any" },
  { value: "missing", label: "Missing signature" },
];

interface Props {
  filters: HoursFilters;
  /** Applies a change to the filters (the page goes back to page 1). */
  onChange: (patch: Partial<HoursFilters>) => void;
  /** Records per status, for the Status choices' counts. */
  statusCounts: Record<StatusFilter, number>;
  shown: number;
  total: number;
}

const Column = ({ children, className = "min-w-[160px] flex-1" }: { children: React.ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
);

/**
 * The search box waits for a pause in typing before it changes the URL, so each keystroke does not re-filter and re-route. It
 * follows the URL back when something else changes the search (Clear filters, the back button).
 */
function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  const latest = useRef(onSearch);
  latest.current = onSearch;

  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setText(value);
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (q === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = q;
      latest.current(q);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Apply what is typed right away (Enter, or leaving the box) instead of waiting out the pause.
  const flush = () => {
    const q = text.trim();
    if (q === sent.current) return;
    sent.current = q;
    onSearch(q);
  };

  return (
    <div>
      <label htmlFor="hours-search" className="mb-1 block text-[12px] font-medium text-gray-600">
        Search
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id="hours-search"
          type="search"
          autoComplete="off"
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            flush();
          }}
          placeholder="SRN, interpreter or title"
          className="w-full rounded-full border border-stone-200 bg-[#F4F3EF] py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-gray-400 hover:border-[rgb(var(--forest-rgb)/0.4)] hover:bg-emerald-50 focus:border-[var(--forest)] focus:bg-emerald-50 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.4)]"
        />
      </div>
    </div>
  );
}

/** Hours review's search box and Status, Appointment date and Signature filters, with a result count and a way to clear them. */
export const HoursReviewFilterBar = ({ filters, onChange, statusCounts, shown, total }: Props) => {
  const active = countActiveFilters(filters);
  const statusOptions = useMemo<DropdownOption[]>(
    () => STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value], count: statusCounts[value] })),
    [statusCounts],
  );

  return (
    <section aria-label="Search and filter hours" className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <Column className="min-w-[220px] flex-[2]">
          <SearchBox value={filters.q} onSearch={(q) => onChange({ q })} />
        </Column>
        <Column>
          <Dropdown id="hours-status" label="Status" layout="stacked" options={statusOptions} value={filters.status} onChange={(status) => onChange({ status: status as StatusFilter })} />
        </Column>
        <Column>
          <Dropdown id="hours-range" label="Appointment date" layout="stacked" options={RANGE_OPTIONS} value={filters.range} onChange={(range) => onChange({ range: range as RangeFilter })} />
        </Column>
        <Column>
          <Dropdown id="hours-signature" label="Signature" layout="stacked" options={SIGNATURE_OPTIONS} value={filters.sig} onChange={(sig) => onChange({ sig: sig as SignatureFilter })} />
        </Column>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-gray-600">
        <p role="status">
          Showing <strong>{shown}</strong> of <strong>{total}</strong> {total === 1 ? "record" : "records"}
          {active > 0 && ` · ${active} ${active === 1 ? "filter" : "filters"} on`}
        </p>
        {active > 0 && (
          <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="font-medium text-[var(--forest)] hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
};
