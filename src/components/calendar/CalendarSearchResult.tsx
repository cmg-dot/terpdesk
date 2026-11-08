"use client";

import { formatAgencyTimeRange } from "@/lib/agencyTime";
import type { SearchEntry } from "@/lib/calendarSearch";
import { formatDateLabel } from "@/lib/dateTimePicker";

interface Props {
  id: string;
  entry: SearchEntry;
  active: boolean;
  onPick: (entry: SearchEntry) => void;
  onHover: () => void;
}

/** One match in the calendar search list. Row 1: the SRN badge and the organization. Row 2: date and time, then the venue. */
export const CalendarSearchResult = ({ id, entry, active, onPick, onHover }: Props) => (
  <li
    id={id}
    role="option"
    aria-selected={active}
    data-search-result={entry.id}
    // mousedown would blur the input (and close the list) before the click lands, so it is held back.
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => onPick(entry)}
    onMouseEnter={onHover}
    className={`cursor-pointer rounded-xl px-3 py-2.5 transition-colors duration-100 ${active ? "bg-emerald-50" : "hover:bg-emerald-50/60"}`}
  >
    <div className="flex items-center gap-2">
      {entry.srn ? (
        <span className="shrink-0 rounded-full bg-[var(--forest)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">SRN #{entry.srn}</span>
      ) : (
        <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">No SRN</span>
      )}
      <span className={`truncate text-sm font-medium ${entry.cancelled ? "text-gray-400 line-through" : "text-[var(--ink)]"}`}>{entry.organization || entry.title || "Request"}</span>
      {entry.cancelled && <span className="shrink-0 text-[11px] font-medium text-gray-500">Cancelled</span>}
    </div>
    <div className="mt-0.5 truncate text-xs text-[var(--sage)]">
      {formatDateLabel(entry.dayKey)} · {formatAgencyTimeRange(entry.startsAt, entry.endsAt)}
      {entry.venue && ` · ${entry.venue}`}
    </div>
  </li>
);
