"use client";

import { useState } from "react";
import { assignInterpreterDirectly } from "@/app/actions/assignInterpreterDirectly";
import type { InterpreterFitStatus } from "@/app/actions/availability";
import { InterpreterFitBadge } from "@/components/scheduling-ui";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { JobPosition } from "@/lib/validation/directAssign";

export interface DirectAssignRosterEntry {
  id: string;
  name: string;
  email?: string;
}

/** The part of an offer this panel reads, to say how many will be closed. */
export interface DirectAssignOfferRef {
  status?: string;
  state?: string;
  positionIndex?: number;
}

export interface DirectAssignSuccess {
  status: string;
  positionIndex: JobPosition;
  interpreterName: string;
  withdrawnOffers: number;
  emailed: boolean;
}

interface DirectAssignPanelProps {
  jobId: string;
  positionIndex: JobPosition;
  /** Show "Position N" in the wording (team jobs only). */
  showPosition: boolean;
  roster: DirectAssignRosterEntry[];
  fits: Record<string, InterpreterFitStatus>;
  offers: ReadonlyArray<DirectAssignOfferRef>;
  onAssigned: (result: DirectAssignSuccess) => void | Promise<void>;
}

/** Only the fits worth a warning; "not provided" / "not shared" just mean the agency can't tell. */
const FIT_WARNINGS: Partial<Record<InterpreterFitStatus, string>> = {
  unavailable: "has a conflicting commitment at this time.",
  outside_hours: "is outside their usual working hours at this time.",
};

const pendingFor = (offers: ReadonlyArray<DirectAssignOfferRef>, position: JobPosition): number =>
  offers.filter((o) => (o.positionIndex ?? 1) === position && (o.status ?? o.state) === "pending").length;

/**
 * Agency override on Job Details: pick anyone on the roster and book them now, skipping the offer email, their
 * acceptance and their auto-book permission. Asks for one confirmation because it withdraws the pending offers
 * and emails the interpreter.
 */
export const DirectAssignPanel = ({ jobId, positionIndex, showPosition, roster, fits, offers, onAssigned }: DirectAssignPanelProps) => {
  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");

  const person = roster.find((r) => r.id === selectedId);
  const fitWarning = person ? FIT_WARNINGS[fits[person.id]] : undefined;
  const pending = pendingFor(offers, positionIndex);
  const where = showPosition ? ` to Position ${positionIndex}` : "";

  const choose = (id: string) => {
    setSelectedId(id);
    setConfirming(false);
    setError("");
  };

  const assign = async () => {
    if (!person || assigning) return;
    setAssigning(true);
    setError("");
    try {
      const result = await assignInterpreterDirectly({ jobId, interpreterId: person.id, positionIndex });
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setSelectedId("");
      setConfirming(false);
      await onAssigned(result);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-4 md:p-5" aria-label="Directly assign interpreter">
      <h4 className="mb-1 text-sm font-semibold text-[var(--ink)]">Directly assign interpreter</h4>
      <p className="mb-4 text-xs leading-relaxed text-gray-600">
        Agency override. Books the interpreter right now: no offer, no waiting for them to accept, and no auto-book permission needed.
        Availability is not enforced. Any pending offers for {showPosition ? `Position ${positionIndex}` : "this job"} are withdrawn.
      </p>

      <SearchableSelect
        label="Interpreter"
        placeholder="Search by name or email"
        emptyText="No interpreters match your search."
        value={selectedId}
        onChange={choose}
        options={roster.map((r) => ({ id: r.id, label: r.name, description: r.email, trailing: <InterpreterFitBadge fit={fits[r.id]} showIcon={false} /> }))}
      />
      {person && fitWarning && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900" role="status">
          <strong className="font-semibold">Heads up:</strong> {person.name} {fitWarning} Direct assignment books them anyway.
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      {confirming && person ? (
        <div role="alertdialog" aria-label="Confirm direct assignment" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Assign {person.name}{where} now?</p>
          <p className="mt-1 text-xs leading-relaxed">
            {pending > 0 ? `${pending} pending offer${pending === 1 ? "" : "s"} will be withdrawn. ` : ""}
            {person.name} is booked immediately and emailed the booking details.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={assign} disabled={assigning} className="rounded-full bg-[#145347] px-5 py-2 text-sm font-medium text-white hover:bg-[#0f4037] disabled:cursor-not-allowed disabled:opacity-60">
              {assigning ? "Assigning…" : "Yes, assign now"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={assigning} className="rounded-full border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!person}
          className="mt-4 w-full rounded-full bg-[#145347] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f4037] disabled:cursor-not-allowed disabled:bg-[#8BA49E] disabled:opacity-50 sm:w-auto"
        >
          Assign directly
        </button>
      )}
    </section>
  );
};
