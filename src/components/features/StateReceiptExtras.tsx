"use client";

import { DateTimeInput } from "@/components/ui/DateTimeInput";

/**
 * The rest of a state receipt in "Log State Job Hours": total miles, other fees, and travel there and back (the report's two
 * "Travel Start / Travel End" pairs). Travel is optional; a leg needs both its start and its end.
 */

export interface TravelLegInput {
  start: string;
  end: string;
}

export const EMPTY_TRAVEL: TravelLegInput[] = [
  { start: "", end: "" },
  { start: "", end: "" },
];

/** The legs filled in, or a message when one has only a start or only an end. */
export function filledTravelLegs(legs: readonly TravelLegInput[]): { ok: true; legs: TravelLegInput[] } | { ok: false; error: string } {
  if (legs.some((l) => Boolean(l.start) !== Boolean(l.end))) return { ok: false, error: "Enter both the start and the end of each travel leg." };
  return { ok: true, legs: legs.filter((l) => l.start && l.end) };
}

interface Props {
  disabled: boolean;
  inputClass: string;
  labelClass: string;
  totalMiles: string;
  onTotalMiles: (value: string) => void;
  otherFees: string;
  onOtherFees: (value: string) => void;
  travel: TravelLegInput[];
  onTravel: (legs: TravelLegInput[]) => void;
}

const LEG_NAMES = ["Travel there", "Travel back"] as const;

export function StateReceiptExtras({ disabled, inputClass, labelClass, totalMiles, onTotalMiles, otherFees, onOtherFees, travel, onTravel }: Props) {
  const setLeg = (index: number, field: keyof TravelLegInput, value: string) => onTravel(travel.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg)));
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="state-miles" className={labelClass}>
            Total Miles
          </label>
          <input id="state-miles" type="number" min="0" step="0.1" value={totalMiles} onChange={(e) => onTotalMiles(e.target.value)} disabled={disabled} className={inputClass} />
        </div>
        <div>
          <label htmlFor="state-fees" className={labelClass}>
            Other Fees (Parking, Ferry, etc.) in USD
          </label>
          <input id="state-fees" type="number" min="0" step="0.01" value={otherFees} onChange={(e) => onOtherFees(e.target.value)} disabled={disabled} className={inputClass} />
        </div>
      </div>

      <fieldset className="space-y-3" data-state-travel="">
        <legend className={labelClass}>Travel time from the receipt (optional)</legend>
        {travel.map((leg, i) => (
          <div key={LEG_NAMES[i]} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`state-travel-${i}-start`} className={labelClass}>
                {LEG_NAMES[i]}: start
              </label>
              <DateTimeInput id={`state-travel-${i}-start`} label={`${LEG_NAMES[i]} start`} value={leg.start} onChange={(v) => setLeg(i, "start", v)} disabled={disabled} clearable className={inputClass} />
            </div>
            <div>
              <label htmlFor={`state-travel-${i}-end`} className={labelClass}>
                {LEG_NAMES[i]}: end
              </label>
              <DateTimeInput id={`state-travel-${i}-end`} label={`${LEG_NAMES[i]} end`} value={leg.end} onChange={(v) => setLeg(i, "end", v)} disabled={disabled} clearable className={inputClass} />
            </div>
          </div>
        ))}
      </fieldset>
    </>
  );
}
