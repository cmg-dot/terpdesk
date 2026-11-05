"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDateInZone, getIanaZone } from "@/utils/timezone";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

interface HistoryEvent {
  id?: string;
  title?: string;
  version?: number;
  actor?: string;
  message?: string;
}

/** The "Version history (n)" toggle and the list of what happened to the record. */
export function VersionHistory({ record }: { record: ServiceRecord }) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const zone = getIanaZone(record.timeZone);
  const history = Array.isArray(record.history) ? (record.history as HistoryEvent[]) : [];

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2"
      >
        {isHistoryExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Version history ({record.version})
      </button>
      {isHistoryExpanded && (
        <div className="text-xs text-[var(--sage)] mb-4 pl-4 space-y-2 border-l-2 border-gray-200">
          {history.length > 0 ? (
            history.map((evt, i) => (
              <div key={evt.id || i} className="text-gray-700">
                <span className="font-semibold">{evt.title}</span> (v{evt.version || 1}) · by {evt.actor || 'System'}
                {evt.message && <p className="text-amber-800 text-[11px] mt-0.5">"{evt.message}"</p>}
              </div>
            ))
          ) : (
            <div>v{record.version} · submitted by {record.interpreterName} · {formatDateInZone(record.actualEnd, zone, 'M/d/yyyy')}</div>
          )}
        </div>
      )}
    </div>
  );
}
