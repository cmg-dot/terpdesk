"use client";

import { useId } from "react";
import { Clock } from "lucide-react";
import { checkOfferExpiry } from "@/lib/offerExpiry";

interface OfferExpiryInputProps {
  hours: string;
  minutes: string;
  onChange: (next: { hours: string; minutes: string }) => void;
  /** Current time in ms (the page's ticking clock), so the preview stays right while the form is open. */
  nowMs: number;
  /** The job's IANA zone: the preview deadline is written in it. */
  timeZone: string;
  startsAt: Date | null;
  disabled?: boolean;
}

const BOX =
  "w-full rounded-full border-none bg-[#F5F4F0] px-4 py-3 text-sm text-gray-800 outline-none transition-shadow focus:ring-2 focus:ring-[#0B3B32] disabled:cursor-not-allowed";

/** "Respond within N hours M minutes", with the resulting deadline previewed in the job's time zone. */
export const OfferExpiryInput = ({ hours, minutes, onChange, nowMs, timeZone, startsAt, disabled }: OfferExpiryInputProps) => {
  const id = useId();
  const check = checkOfferExpiry({ hours, minutes, now: new Date(nowMs), timeZone, startsAt });

  return (
    <div>
      <p id={`${id}-label`} className="mb-2 block text-sm text-[var(--sage)]">Offer expires in</p>
      <div role="group" aria-labelledby={`${id}-label`} className="flex w-full flex-col gap-4 sm:flex-row">
        <div className="w-full flex-1">
          <label htmlFor={`${id}-h`} className="sr-only">Hours before the offer expires</label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-h`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={hours}
              disabled={disabled}
              aria-invalid={!check.ok}
              onChange={(e) => onChange({ hours: e.target.value, minutes })}
              className={BOX}
            />
            <span className="shrink-0 text-sm text-gray-600" aria-hidden="true">hours</span>
          </div>
        </div>
        <div className="w-full flex-1">
          <label htmlFor={`${id}-m`} className="sr-only">Minutes before the offer expires</label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-m`}
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              step={1}
              value={minutes}
              disabled={disabled}
              aria-invalid={!check.ok}
              onChange={(e) => onChange({ hours, minutes: e.target.value })}
              className={BOX}
            />
            <span className="shrink-0 text-sm text-gray-600" aria-hidden="true">minutes</span>
          </div>
        </div>
      </div>
      {check.ok ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--sage)]">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Expires {check.label}, counted from when you send the offer.
        </p>
      ) : (
        <p role="status" className="mt-2 text-xs text-[#C23B22]">{check.message}</p>
      )}
    </div>
  );
};
