"use client";

import { Search, X } from "lucide-react";
import { INBOX_TABS } from "@/lib/inboxCategory";
import type { InboxTab } from "@/lib/inboxCategory";

interface Props {
  query: string;
  onQuery: (value: string) => void;
  tab: InboxTab;
  onTab: (tab: InboxTab) => void;
  counts: Record<InboxTab, number>;
}

/** The search box (SRN, subject or sender) and the segmented filter tabs, each with how many emails it would show. */
export function InboxToolbar({ query, onQuery, tab, onTab, counts }: Props) {
  return (
    <div className="space-y-3 border-b border-gray-100 bg-[#FBFAF7] px-4 py-3.5 sm:px-5">
      <label className="relative block">
        <span className="sr-only">Search emails</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sage)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by SRN, subject or sender"
          autoComplete="off"
          className="w-full rounded-full border border-transparent bg-[#F4F3EF] py-2.5 pl-10 pr-10 text-sm text-gray-800 outline-none transition-shadow placeholder:text-gray-400 focus:border-emerald-200 focus:bg-white focus:ring-2 focus:ring-[#0B3B32]/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {query !== "" && (
          <button type="button" onClick={() => onQuery("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      <div role="tablist" aria-label="Filter emails" className="-mx-1 overflow-x-auto px-1 pb-0.5">
        <div className="inline-flex gap-1 rounded-full bg-[#F4F3EF] p-1">
          {INBOX_TABS.map(({ id, label }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                data-inbox-tab={id}
                onClick={() => onTab(id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0B3B32]/40 ${active ? "bg-white text-[var(--forest)] shadow-sm" : "text-[var(--sage)] hover:text-[var(--ink)]"}`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-emerald-100 text-emerald-800" : "bg-white/70 text-gray-500"}`}>{counts[id]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
