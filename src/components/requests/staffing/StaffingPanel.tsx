"use client";

import { useMemo } from "react";
import { ClientNameField } from "@/components/requests/staffing/ClientNameField";
import { PriorAuthField } from "@/components/requests/staffing/PriorAuthField";
import { PositionStaffing } from "@/components/requests/staffing/PositionStaffing";
import { RequestedInterpreterBadge } from "@/components/requests/staffing/RequestedInterpreterBadge";
import type { Position, PositionView, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";
import { pickByReportName } from "@/lib/verificationPending";

interface Props {
  /** One view per active position, in position order (1 to 10). */
  positions: PositionView[];
  ctx: StaffingContext;
  actions: StaffingActions;
  /** The interpreter the state's form asked for by name (intake.requestedInterpreter), when it did. */
  requestedInterpreter?: string | null;
  /** The whole roster, to find that person. */
  fullRoster: { id: string; name: string }[];
  /** The client's name saved on the job (agency-only), and what to do once a new one is saved. */
  clientName: string;
  onClientSaved: (clientName: string) => void;
  /** The prior-authorization number saved on the job (agency-only), and what to do once a new one is saved. */
  priorAuth: string;
  onPriorAuthSaved: (priorAuth: string) => void;
}

/**
 * Staffing and booking, in one place under the request form: who is booked in each position, and the controls to fill an open
 * one (send an offer, or book directly). When the state asked for a particular interpreter, that request sits above the controls
 * with a one-click way to choose them.
 */
export function StaffingPanel({ positions, ctx, actions, requestedInterpreter, fullRoster, clientName, onClientSaved, priorAuth, onPriorAuthSaved }: Props) {
  const requested = requestedInterpreter?.trim() || null;
  const match = useMemo(() => {
    if (!requested) return null;
    const id = pickByReportName(fullRoster.map((p) => ({ id: p.id, names: [p.name] })), requested);
    const person = id ? fullRoster.find((p) => p.id === id) : undefined;
    return person ? { id: person.id, name: person.name } : null;
  }, [requested, fullRoster]);

  const alreadyBooked = Boolean(match && positions.some((p) => p.accepted?.interpreterId === match.id));
  // The first position that is still open to an offer: nobody booked, no offer out, and not paused by "Directly assign".
  const openPosition: Position | null = positions.find((p) => !p.accepted && !p.activeOffer && !p.offerLocked)?.posIdx ?? null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 border border-gray-200/50 shadow-none mb-4">
      <h2 className="text-[18px] font-medium text-[var(--ink)] mb-4">Staffing</h2>
      <p className="text-sm text-[var(--sage)] mb-1">Pending offers do not reserve time.</p>
      <p className="text-sm text-[var(--sage)] mb-6">Back-to-back appointments are allowed. Travel time is not checked.</p>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ClientNameField requestId={ctx.requestId} value={clientName} onSaved={onClientSaved} />
        <PriorAuthField requestId={ctx.requestId} value={priorAuth} onSaved={onPriorAuthSaved} />
      </div>

      {requested && (
        <RequestedInterpreterBadge
          requestedName={requested}
          match={match}
          alreadyBooked={alreadyBooked}
          openPosition={openPosition}
          showPosition={ctx.totalPositions > 1}
          openOrdinal={positions.find((p) => p.posIdx === openPosition)?.ordinal}
          onSelect={actions.setRecipient}
        />
      )}

      <div className="space-y-6">
        {positions.map((view) => (
          <PositionStaffing key={view.posIdx} view={view} ctx={ctx} actions={actions} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          data-add-slot
          onClick={actions.addSlot}
          disabled={Boolean(ctx.addBlockedReason) || ctx.slotBusy !== null}
          title={ctx.addBlockedReason ?? 'Add another interpreter position to this job'}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ctx.slotBusy === 'add' ? 'Adding…' : '+ Add interpreter slot'}
        </button>
        <span className="text-xs text-[var(--sage)]">{positions.length} of {ctx.maxPositions} positions</span>
        {ctx.addBlockedReason && <span className="text-xs text-[var(--sage)]">{ctx.addBlockedReason}</span>}
      </div>
      {ctx.slotError && (
        <div role="alert" data-slot-error className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{ctx.slotError}</span>
          <button type="button" onClick={actions.clearSlotError} aria-label="Dismiss" className="text-red-700 hover:text-red-900 leading-none text-lg">&times;</button>
        </div>
      )}

      <div className="mt-6">
        <button type="button" onClick={actions.openAccess} className="text-sm font-medium text-[var(--forest)] hover:underline transition-colors">
          Manage access & virtual credentials →
        </button>
      </div>
    </div>
  );
}
