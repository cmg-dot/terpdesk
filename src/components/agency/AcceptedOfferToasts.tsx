"use client";

import { AnimatePresence } from "framer-motion";
import { AcceptedOfferToast } from "@/components/agency/AcceptedOfferToast";
import { useAcceptedOfferToasts } from "@/hooks/useAcceptedOfferToasts";

/**
 * Floating "Offer accepted" toasts on every agency page (in the dashboard layout): centred at the top on a phone, top right under
 * the header from 640px up. Up to three at a time, above the header and below dialogs. The bell keeps each one as well.
 */
export function AcceptedOfferToasts() {
  const { toasts, finish } = useAcceptedOfferToasts();
  return (
    <ul
      aria-live="polite"
      aria-label="Accepted offers"
      className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:top-20 sm:w-96 sm:items-end sm:px-0"
    >
      <AnimatePresence initial={false}>
        {toasts.map((alert) => (
          <AcceptedOfferToast key={alert.offerId} alert={alert} onFinish={() => finish(alert.offerId)} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
