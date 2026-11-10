"use client";

import { Lock } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { DirectAssignPanel } from "@/components/requests/DirectAssignPanel";
import { ExpiredOfferNotice } from "@/components/requests/ExpiredOfferNotice";
import { CollapsiblePreviousOffers } from "@/components/requests/staffing/CollapsiblePreviousOffers";
import { OfferComposer } from "@/components/requests/staffing/OfferComposer";
import type { PositionView, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";
import { mapSafeZone, parseSafeDate } from "@/lib/requestDetailsFormat";

interface Props {
  view: PositionView;
  ctx: StaffingContext;
  actions: StaffingActions;
}

/** A position with nobody booked: the offer awaiting an answer, or the form to send one, and the direct-assign override. */
export function OpenPosition({ view, ctx, actions }: Props) {
  const { posIdx, activeOffer, pastOffers } = view;
  return (
    <>
      {!activeOffer && (
        <ExpiredOfferNotice
          pastOffers={pastOffers}
          appointmentFinished={ctx.isAppointmentFinished}
          now={ctx.nowMs}
          onOfferAgain={(id) => actions.setRecipient(posIdx, id)}
        />
      )}

      {pastOffers.length > 0 && (
        <CollapsiblePreviousOffers pastOffers={pastOffers} isAppointmentFinished={ctx.isAppointmentFinished} apptTz={ctx.apptTimeZone} />
      )}

      {activeOffer ? (
        <div className="bg-[#F5F4F0] p-4 rounded-xl mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[var(--ink)] font-medium">{activeOffer.interpreterName}</span>
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">{activeOffer.state || activeOffer.status}</span>
          </div>
          <p className="text-sm text-[var(--sage)] mt-2 mb-4">
            Response due {(() => {
              try {
                const d = parseSafeDate(activeOffer.expiresAt);
                if (!d) return 'Unknown';
                return formatInTimeZone(d, mapSafeZone(ctx.apptTimeZone), 'MM/dd/yyyy h:mm:ss a');
              } catch (e) {
                return 'Unknown';
              }
            })()}
          </p>
          <button
            type="button"
            onClick={() => actions.withdrawOffer(activeOffer.id)}
            className="bg-white border border-gray-300 rounded-full px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Withdraw offer
          </button>
        </div>
      ) : !ctx.isFutureAppointment ? (
        // Started or past: no new offers (the server refuses them too) until the time is edited forward.
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="flex items-center gap-2 font-medium text-[var(--ink)]">
            <Lock className="h-4 w-4 text-gray-500" aria-hidden="true" />
            {ctx.isAppointmentInProgress ? "This appointment is under way" : "This appointment's time has passed"}
          </p>
          <p className="mt-1 text-xs text-[var(--sage)]">
            New offers can&apos;t be sent for a job that has started or ended. To offer it again, edit the request
            to a future date and time.
          </p>
        </div>
      ) : (
        <OfferComposer view={view} ctx={ctx} actions={actions} />
      )}

      {/* Works even while an offer is out: assigning withdraws it. Not offered once the job has started. */}
      {ctx.isFutureAppointment && (
        <DirectAssignPanel
          jobId={ctx.requestId}
          positionIndex={posIdx}
          showPosition={ctx.totalPositions > 1}
          positionLabel={view.ordinal}
          roster={view.roster}
          fits={ctx.fits}
          offers={ctx.offers}
          onAssigned={(result) => actions.directlyAssigned(posIdx, result)}
          onEngagedChange={(engaged) => actions.setAssignEngaged(posIdx, engaged)}
          lockedReason={view.recipient && !activeOffer ? 'Direct assignment is paused while a recipient is selected for an offer above. Clear that selection to assign directly instead.' : undefined}
        />
      )}
    </>
  );
}
