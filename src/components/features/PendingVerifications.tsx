"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { assignVerificationInterpreter, getPendingVerifications } from "@/app/actions/pendingVerifications";
import { matchesSearch } from "@/lib/hoursReviewFilter";
import { SignatureImage } from "@/components/features/SignatureImage";
import { Dropdown } from "@/components/ui/Dropdown";
import type { DropdownOption } from "@/lib/dropdown";
import type { PendingVerificationView } from "@/lib/verificationPending";
import { formatDateTimeRangeInZone } from "@/utils/timezone";

/** The picker's choices, grouped so the likely person is first: who the report names, who is booked, then the roster. */
export const pickerOptions = (candidates: PendingVerificationView["candidates"]): DropdownOption[] =>
  candidates.map((c) => ({
    value: c.id,
    label: c.label,
    group: c.suggested ? "Matches the name in the report" : c.booked ? "Booked on this job" : "Everyone on the roster",
  }));

const yesNo = (value: boolean | null): string => (value === null ? "Not stated" : value ? "Yes" : "No");

function PendingCard({ item, onDone }: { item: PendingVerificationView; onDone: () => void }) {
  const [chosen, setChosen] = useState(item.preselectedId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => pickerOptions(item.candidates), [item.candidates]);
  const name = item.reportInterpreter.name;

  const assign = async () => {
    if (!chosen) {
      setError("Choose the interpreter this report is for.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await assignVerificationInterpreter({ requestId: item.requestId, reportId: item.reportId, interpreterId: chosen }).catch(() => null);
    setBusy(false);
    if (result?.success) onDone();
    else setError(result?.error ?? "We could not record those hours. Please try again.");
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-6 sm:p-8" data-pending-report={item.reportId}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">{item.title}</h3>
          <p className="text-xs text-[var(--sage)]">{item.title.includes(item.reference.replace("SRN ", "")) ? " " : item.reference}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[12px] font-medium text-amber-800">Needs an interpreter</span>
      </div>

      <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{item.reasonText}</p>

      <div className="mb-6 grid grid-cols-1 gap-5 text-sm md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[var(--sage)]">The report is for</div>
            <div className="text-[var(--ink)]">
              {name ?? "No interpreter named"}
              {item.reportInterpreter.credentials ? ` (${item.reportInterpreter.credentials})` : ""}
              {item.reportInterpreter.id ? <span className="text-[var(--sage)]"> · state ID {item.reportInterpreter.id}</span> : null}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[var(--sage)]">Scheduled booking</div>
            <div className="text-[var(--ink)]">{formatDateTimeRangeInZone(item.scheduledStart, item.scheduledEnd, item.timeZone)}</div>
          </div>
          <div>
            <div className="mb-1 text-[var(--sage)]">Reported service time</div>
            <div className="text-[var(--ink)]">{item.actualStart && item.actualEnd ? formatDateTimeRangeInZone(item.actualStart, item.actualEnd, item.timeZone) : "No times reported"}</div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[var(--sage)]">Mileage · service completed</div>
            <div className="text-[var(--ink)]">{item.totalMiles} mi · {yesNo(item.serviceComplete)}</div>
          </div>
          {item.cancellation && (
            <div>
              <div className="mb-1 text-[var(--sage)]">Cancellation</div>
              <div className="text-[var(--ink)]">{item.cancellation}</div>
            </div>
          )}
          {item.comments && (
            <div>
              <div className="mb-1 text-[var(--sage)]">ODHH comments</div>
              <div className="text-[var(--ink)]">{item.comments}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl bg-[#F5F4F0] p-4 md:p-5">
        <h4 className="mb-2 text-sm font-medium text-[var(--ink)]">Service-verification signature</h4>
        {item.signatureUrl ? <SignatureImage src={item.signatureUrl} alt="Service-verification signature" /> : <p className="text-sm text-[var(--sage)]">No signature came with this report.</p>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm">
          <label htmlFor={`pending-${item.reportId}`} className="mb-1 block text-sm font-medium text-[var(--ink)]">Interpreter for these hours</label>
          <Dropdown id={`pending-${item.reportId}`} options={options} value={chosen} onChange={setChosen} variant="form" placeholder="Choose an interpreter" ariaLabel="Interpreter for these hours" invalid={Boolean(error) && !chosen} />
        </div>
        <button
          type="button"
          onClick={assign}
          disabled={busy}
          className="rounded-full bg-[#145347] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0f4037] disabled:opacity-60"
        >
          {busy ? "Recording…" : "Assign & record hours"}
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--sage)]">If they are not booked on this job yet, they will be booked. The hours then wait under Awaiting review like any other report.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Hours review > "Needs an interpreter": service-verification reports that could not be tied to one booked interpreter.
 * Renders nothing when there are none. After an assignment it asks the page to reload its records (`onAssigned`).
 */
export function PendingVerifications({ onAssigned, query = "" }: { onAssigned: () => void; /** The search box's text: only reports whose SRN, title or named interpreter match are shown. */ query?: string }) {
  const [items, setItems] = useState<PendingVerificationView[] | null>(null);

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
  return (
    <section aria-label="Reports that need an interpreter" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--ink)]">Needs an interpreter ({shown.length === items.length ? items.length : `${shown.length} of ${items.length}`})</h2>
        <p className="text-sm text-[var(--sage)]">These ODHH reports arrived for a job where nobody is booked, or where the report does not say which of two interpreters it is for.</p>
        {shown.length === 0 && <p role="status" className="mt-2 text-sm text-[var(--sage)]">None of these match your search.</p>}
      </div>
      {shown.map((item) => (
        <PendingCard key={item.reportId} item={item} onDone={() => { onAssigned(); void load(); }} />
      ))}
    </section>
  );
}
