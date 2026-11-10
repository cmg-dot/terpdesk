"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPendingVerifications } from "@/app/actions/pendingVerifications";
import { PendingReportRow } from "@/components/features/hours-review/PendingReportRow";
import { matchesSearch } from "@/lib/hoursReviewFilter";
import { previewItems, showAllLabel } from "@/lib/pendingVerificationView";
import type { PendingVerificationView } from "@/lib/verificationPending";

/**
 * Hours review > "Needs matching to an interpreter": service-verification reports that could not be tied to one booked interpreter.
 * Renders nothing when there are none. Each is a compact row (the first few show, "Show all" opens the rest); the page's search
 * box filters them by SRN, title or the interpreter the report names. After an assignment it asks the page to reload (`onAssigned`).
 */
export function PendingVerifications({ onAssigned, query = "" }: { onAssigned: () => void; /** The search box's text: only reports whose SRN, title or named interpreter match are shown. */ query?: string }) {
  const [items, setItems] = useState<PendingVerificationView[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setItems(await getPendingVerifications().catch(() => []));
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, [load]);

  const shown = useMemo(
    () => (items ?? []).filter((item) => matchesSearch(query, item.reference, item.title, item.reportInterpreter.name)),
    [items, query],
  );

  if (!items || items.length === 0) return null;
  const visible = previewItems(shown, showAll);
  const toggleLabel = showAllLabel(shown.length, showAll);
  return (
    <section aria-label="Reports that need matching to an interpreter" className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-[var(--ink)]">Needs matching to an interpreter ({shown.length === items.length ? items.length : `${shown.length} of ${items.length}`})</h2>
        <p className="text-sm text-[var(--sage)]">
          These ODHH reports arrived for a job where nobody is booked, or where the report does not say which of the job's interpreters it is for. Match each one to the interpreter who worked it. This does not approve the hours: it links the report to that interpreter (and books them on the job if they are not booked yet), and the hours then wait under Awaiting review, where you approve them.
        </p>
        {shown.length === 0 && <p role="status" className="mt-2 text-sm text-[var(--sage)]">None of these match your search.</p>}
      </div>
      {visible.map((item) => (
        <PendingReportRow key={item.reportId} item={item} onDone={() => { onAssigned(); void load(); }} />
      ))}
      {toggleLabel && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="rounded-full border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {toggleLabel}
        </button>
      )}
    </section>
  );
}
