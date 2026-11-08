"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { assignVerificationInterpreter } from "@/app/actions/pendingVerifications";
import { SignatureImage } from "@/components/features/SignatureImage";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { SearchableOption } from "@/components/ui/SearchableSelect";
import { candidateTag, completionLabel, detailsToggleLabel, reportedName } from "@/lib/pendingVerificationView";
import type { PendingVerificationView } from "@/lib/verificationPending";
import { formatDateTimeRangeInZone } from "@/utils/timezone";

const CHIP = "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap";
const TAG = "rounded-full px-2 py-0.5 text-[11px] font-medium";

/** One report, folded to a row: who it is for, the job, the picker and Assign inline, and the signature behind a toggle. */
export function PendingReportRow({ item, onDone }: { item: PendingVerificationView; onDone: () => void }) {
  const [chosen, setChosen] = useState(item.preselectedId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const options = useMemo<SearchableOption[]>(
    () =>
      item.candidates.map((c) => {
        const tag = candidateTag(c);
        return {
          id: c.id,
          label: c.label,
          trailing: tag ? <span className={`${TAG} ${tag === "Name match" ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>{tag}</span> : undefined,
        };
      }),
    [item.candidates],
  );

  const assign = async () => {
    if (busy) return;
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

  const showReference = !item.title.includes(item.reference.replace("SRN ", ""));

  return (
    <article className="rounded-2xl border border-amber-200 bg-white" data-pending-report={item.reportId}>
      <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--ink)] md:truncate">
            {item.title}
            {showReference && <span className="font-normal text-[var(--sage)]"> · {item.reference}</span>}
          </h3>
          <p className="text-sm text-gray-700 md:truncate">
            <span className="text-[var(--sage)]">Report for</span> {reportedName(item.reportInterpreter)}
            {item.reportInterpreter.id ? <span className="text-[var(--sage)]"> · state ID {item.reportInterpreter.id}</span> : null}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:w-[26rem]">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              id={`pending-${item.reportId}`}
              variant="cream"
              label="Interpreter for these hours"
              labelClassName="sr-only"
              placeholder="Choose an interpreter"
              emptyText="No interpreters match your search."
              options={options}
              value={chosen}
              onChange={(id) => { setChosen(id); setError(null); }}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            onClick={assign}
            disabled={busy}
            title="If they are not booked on this job yet, they will be booked. The hours then wait under Awaiting review like any other report."
            className="rounded-full bg-[var(--forest-bright)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-bright-hover)] disabled:opacity-60"
          >
            {busy ? "Recording…" : "Assign"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-100 px-4 py-2.5 text-sm">
        <span className="text-gray-700">{formatDateTimeRangeInZone(item.scheduledStart, item.scheduledEnd, item.timeZone)}</span>
        <span className={`${CHIP} bg-gray-100 text-gray-700`}>{item.totalMiles} mi</span>
        <span className={`${CHIP} ${item.serviceComplete === false ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{completionLabel(item.serviceComplete)}</span>
        <span className="min-w-0 text-xs text-amber-800">{item.reasonText}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[var(--forest)] hover:bg-emerald-50"
        >
          {detailsToggleLabel(item)}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div id={panelId} className="space-y-4 border-t border-amber-100 p-4 text-sm">
          <div className="rounded-xl bg-[#F5F4F0] p-4">
            <h4 className="mb-2 text-sm font-medium text-[var(--ink)]">Service-verification signature</h4>
            {item.signatureUrl ? <SignatureImage src={item.signatureUrl} alt="Service-verification signature" /> : <p className="text-sm text-[var(--sage)]">No signature came with this report.</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[var(--sage)]">Reported service time</div>
              <div className="text-[var(--ink)]">{item.actualStart && item.actualEnd ? formatDateTimeRangeInZone(item.actualStart, item.actualEnd, item.timeZone) : "No times reported"}</div>
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
      )}

      {error && <p role="alert" className="mx-4 mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
    </article>
  );
}
