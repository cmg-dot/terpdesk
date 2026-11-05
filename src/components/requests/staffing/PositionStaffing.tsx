"use client";

import { BookedPosition } from "@/components/requests/staffing/BookedPosition";
import { OpenPosition } from "@/components/requests/staffing/OpenPosition";
import type { PositionView, StaffingActions, StaffingContext } from "@/components/requests/staffing/staffingTypes";

interface Props {
  view: PositionView;
  ctx: StaffingContext;
  actions: StaffingActions;
}

/** One position (one interpreter): its booking status, who is assigned, and either the booking or the controls to fill it. */
export function PositionStaffing({ view, ctx, actions }: Props) {
  const { posIdx, accepted, activeOffer, needsReplacement } = view;

  let slotBadgeColor = 'bg-[#FEF3C7] text-[#92400E]';
  let slotBadgeText = 'Booking: Unfilled';
  if (accepted) {
    slotBadgeColor = 'bg-green-100 text-green-700';
    slotBadgeText = 'Booking: Filled';
  } else if (activeOffer) {
    slotBadgeColor = 'bg-blue-100 text-blue-700';
    slotBadgeText = 'Booking: Offer awaiting response';
  } else if (needsReplacement) {
    slotBadgeColor = 'bg-[#FDE8E8] text-[#9B1C1C]';
    slotBadgeText = 'Booking: Needs replacement';
  }

  return (
    <div className={ctx.totalPositions === 2 ? 'p-5 sm:p-6 rounded-2xl border border-gray-200/80 bg-[#FAFAF8]' : ''}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[var(--ink)] text-base">Position {posIdx} · interpreter</h3>
        {ctx.totalPositions === 2 && (
          <span className="text-xs text-[var(--sage)] font-medium">Position {posIdx} of 2</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`px-3 py-1 text-[12px] font-medium rounded-full ${slotBadgeColor}`}>
          {slotBadgeText}
        </span>
        <span className="px-3 py-1 bg-white border border-gray-200 text-gray-600 text-[12px] font-medium rounded-full">
          Access: Available
        </span>
      </div>

      <p className="text-sm text-gray-700 mt-3 mb-4">
        Assigned interpreter: <span className="text-[var(--sage)]">{accepted ? accepted.interpreterName : 'Unfilled'}</span>
      </p>

      {accepted ? <BookedPosition view={view} booking={accepted} ctx={ctx} actions={actions} /> : <OpenPosition view={view} ctx={ctx} actions={actions} />}
    </div>
  );
}
