"use client";

import { useSession } from "next-auth/react";
import { StandaloneSteps } from "@/components/interpreter/StandaloneSteps";
import { useConnectedAgencyCount } from "@/hooks/useConnectedAgencyCount";

/**
 * The Upcoming tab with nothing in it: says where offers come from and what to do meanwhile. Someone with no agency connection
 * (or one still loading) sees the three steps; a connected interpreter sees the two that do not need an agency.
 */
export function UpcomingEmpty() {
  const { data: session } = useSession();
  const count = useConnectedAgencyCount(session?.user?.id);
  const connected = (count ?? 0) > 0;
  return (
    <section data-upcoming-empty="" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-[16px] font-semibold text-[var(--ink)]">No upcoming offers or bookings right now</h2>
        <p className="text-[14px] text-[var(--sage)]">
          {count === 0
            ? "You are not connected to an agency yet, so no offers can reach you. Offers and bookings from an agency appear here once you are connected."
            : "Offers and bookings from your agencies appear here as they are sent. While you wait, keep your calendar and profile current."}
        </p>
      </div>
      <StandaloneSteps connected={connected} compact />
    </section>
  );
}
