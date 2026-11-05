"use client";

import { Star } from "lucide-react";
import type { Position } from "@/components/requests/staffing/staffingTypes";

export interface RequestedMatch {
  id: string;
  name: string;
}

interface Props {
  /** The interpreter the state's form asks for, as it wrote the name. */
  requestedName: string;
  /** Who on the roster that name belongs to; null when nobody (or more than one person) fits. */
  match: RequestedMatch | null;
  /** They are already booked on this job. */
  alreadyBooked: boolean;
  /** The first position still open to an offer, or null when none is. */
  openPosition: Position | null;
  /** More than one position, so the button says which one it fills. */
  showPosition: boolean;
  onSelect: (posIdx: Position, id: string) => void;
}

/**
 * "Requested: Kimberly Page" above the booking controls, with one click to choose them in the offer picker. It is a preference
 * from the state, not a booking: choosing only fills the picker, and staff still send the offer (or book directly).
 */
export function RequestedInterpreterBadge({ requestedName, match, alreadyBooked, openPosition, showPosition, onSelect }: Props) {
  return (
    <div data-requested-interpreter className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[13px] font-semibold text-amber-900">
        <Star className="h-3.5 w-3.5" aria-hidden="true" />
        Requested: {requestedName}
      </span>
      {alreadyBooked ? (
        <span className="text-sm text-amber-900">Already booked on this job.</span>
      ) : !match ? (
        <span className="text-sm text-amber-900">Not found on your roster by that name. Search for them below.</span>
      ) : openPosition === null ? (
        <span className="text-sm text-amber-900">Every position already has an offer or a booking.</span>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(openPosition, match.id)}
          className="rounded-full bg-[#145347] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#0f4037]"
        >
          Select {match.name}{showPosition ? ` for Position ${openPosition}` : ""}
        </button>
      )}
      <span className="text-xs text-amber-800">A request from the state, not a booking.</span>
    </div>
  );
}
