import { Info } from "lucide-react";
import type { StaffBooking } from "@/components/requests/staffing/staffingTypes";
import { travelLabel } from "@/lib/acceptedOfferAlert";

/**
 * What a booked interpreter said when accepting, where staff enter the booking: "{Name} accepted · Requested travel time: 2 hr ·
 * Note: "…"". Prominent while there is still booking work to do: on a state job until it is marked confirmed on the ODHH portal
 * (then the same facts shrink to chips), on any other job always. Nothing when the interpreter was not asked (booked by staff).
 */
export function AcceptAnswersCallout({ booking, prominent }: { booking: StaffBooking; prominent: boolean }) {
  const asked = booking.travelRequested != null || Boolean(booking.availabilityNote);
  if (!asked) return null;
  const travel = booking.travelRequested === true ? `Requested travel time: ${travelLabel(booking.travelMinutes ?? 0)}` : booking.travelRequested === false ? "No travel time needed" : "";

  if (!prominent) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 text-xs" data-accept-answers="compact">
        {booking.travelRequested === true && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900">{travel}</span>}
        {booking.travelRequested === false && <span className="rounded-full bg-white px-2.5 py-1 text-[var(--sage)]">{travel}</span>}
        {booking.availabilityNote && <span className="rounded-full bg-white px-2.5 py-1 text-[var(--ink)]">Note: &ldquo;{booking.availabilityNote}&rdquo;</span>}
      </div>
    );
  }

  return (
    <div role="note" className="mt-3 flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" data-accept-answers="callout">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold">
          {booking.interpreterName} accepted
          {travel && <span className="font-normal"> · {travel}</span>}
        </p>
        {booking.availabilityNote && <p className="mt-0.5 break-words">Note: &ldquo;{booking.availabilityNote}&rdquo;</p>}
      </div>
    </div>
  );
}
