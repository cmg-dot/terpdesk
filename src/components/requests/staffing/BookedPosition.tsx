"use client";

import { Lock } from "lucide-react";
import { RequestTimesheetButton } from "@/components/features/RequestTimesheetButton";
import { ResendDetailsButton } from "@/components/requests/ResendDetailsButton";
import { CollapsiblePreviousOffers } from "@/components/requests/staffing/CollapsiblePreviousOffers";
import type { PositionView, StaffBooking, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";

interface Props {
  view: PositionView;
  booking: StaffBooking;
  ctx: StaffingContext;
  actions: StaffingActions;
}

/** A position with an interpreter booked: who, the timesheet and resend-details buttons, and removing the booking. */
export function BookedPosition({ view, booking, ctx, actions }: Props) {
  const { posIdx, pastOffers, assignedInterpreterId } = view;
  const flags = ctx.timesheetFlags[assignedInterpreterId];
  return (
    <div className="space-y-4">
      <div className="bg-[#F5F4F0] p-4 rounded-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--ink)] font-medium">{booking.interpreterName}</span>
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold capitalize">Assigned</span>
          </div>
          <div className="flex items-center gap-3">
            {assignedInterpreterId && ctx.requestId && (
              <RequestTimesheetButton
                requestId={ctx.requestId}
                interpreterId={assignedInterpreterId}
                assignmentId={String(booking.id || '')}
                startTime={ctx.startsAtIso}
                endTime={ctx.endsAtIso}
                timezone={ctx.apptTimeZone}
                timesheetDispatched={Boolean(flags?.dispatched)}
                timesheetSubmitted={Boolean(flags?.submitted)}
                timesheetApproved={Boolean(flags?.approved)}
                isStateJob={ctx.isStateJob}
                className="mb-0"
                onSuccess={(message) => {
                  actions.toast(message);
                  actions.reloadTimesheetFlags(ctx.requestId);
                }}
              />
            )}
            {/* Booked: staff can re-send the booking confirmation (with the secure details link). */}
            {!ctx.isCancelled && <ResendDetailsButton requestId={ctx.requestId} positionIndex={posIdx} />}
            {ctx.isBookingLocked ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-200/70 text-gray-600 text-xs font-medium">
                <Lock className="w-3.5 h-3.5 text-gray-500" />
                <span>{ctx.isAppointmentInProgress ? 'Locked · In progress' : 'Locked · Appointment passed'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => actions.openRemoveBooking(posIdx, booking.id, booking.interpreterName)}
                className="text-[var(--sage)] hover:text-red-600 text-sm font-medium transition-colors"
              >
                Remove booking
              </button>
            )}
          </div>
        </div>
      </div>

      {pastOffers.length > 0 && (
        <CollapsiblePreviousOffers pastOffers={pastOffers} isAppointmentFinished={ctx.isAppointmentFinished} apptTz={ctx.apptTimeZone} />
      )}
    </div>
  );
}
