"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { PastOffer } from "@/components/requests/ExpiredOfferNotice";
import { mapSafeZone, parseSafeDate } from "@/lib/requestDetailsFormat";

/** "Previous offers (n)": the offers that ended without a booking, folded away until asked for. */
export function CollapsiblePreviousOffers({
  pastOffers,
  isAppointmentFinished,
  apptTz,
}: {
  pastOffers: PastOffer[];
  isAppointmentFinished: boolean;
  apptTz?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!pastOffers || pastOffers.length === 0) return null;

  return (
    <div className="bg-[#F5F4F0] rounded-xl p-4 mb-6 transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 text-gray-700 transition-transform duration-200 ${
              isOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
          <span className="font-medium text-sm text-[var(--ink)]">
            Previous offers ({pastOffers.length})
          </span>
        </div>
        <span className="text-xs text-[var(--sage)] font-normal group-hover:text-gray-700 transition-colors">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3.5 space-y-3 pt-3 border-t border-gray-200/60">
          {pastOffers.map((offer, idx) => {
            const rawState = offer.status || offer.state || 'pending';
            const deadlineMs = offer.expiresAt ? new Date(offer.expiresAt).getTime() : NaN;
            const deadlinePassed = !Number.isNaN(deadlineMs) && Date.now() > deadlineMs;
            const isExpired = rawState === 'expired' || (rawState === 'pending' && (isAppointmentFinished || deadlinePassed));
            const displayState = isExpired ? 'expired' : rawState;

            let badgeClass = "bg-white border border-gray-200 text-gray-600";
            if (isExpired) {
              badgeClass = "bg-amber-100 text-amber-900 border border-amber-300 font-semibold";
            } else if (displayState === 'withdrawn') {
              badgeClass = "bg-gray-100 text-gray-700 border border-gray-200";
            } else if (displayState === 'declined') {
              badgeClass = "bg-red-50 text-red-700 border border-red-200";
            }

            return (
              <div key={idx} className="last:mb-0">
                <div className="flex items-center gap-2 pl-6 flex-wrap">
                  <span className="text-xs sm:text-sm text-gray-700 font-medium">{offer.interpreterName} ·</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${badgeClass}`}>
                    {isExpired ? 'Expired' : displayState}
                  </span>
                </div>
                <div className="text-xs sm:text-sm text-[var(--sage)] pl-6 mt-1 text-wrap">
                  {isExpired ? (
                    <span>{isAppointmentFinished ? 'Expired · Appointment ended before response was submitted' : 'Expired · No response before the offer deadline'}</span>
                  ) : (
                    <span>
                      {displayState.charAt(0).toUpperCase() + displayState.slice(1)} {(() => {
                        try {
                          const d = parseSafeDate(offer.expiresAt);
                          if (!d) return '';
                          return formatInTimeZone(d, mapSafeZone(apptTz), 'MMM d, h:mm a');
                        } catch (e) {
                          return '';
                        }
                      })()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
