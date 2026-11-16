"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { acknowledgeAcceptedOffers, getAcceptedOfferAlerts } from "@/app/actions/acceptedOfferAlerts";
import type { AcceptedOfferAlert } from "@/lib/acceptedOfferAlert";
import { acceptedAlertLine } from "@/lib/acceptedOfferAlert";

const SHOWN = 3;

/**
 * Top of every agency page: each booking an interpreter accepted that staff have not dismissed yet ("Christy accepted SRN #... ·
 * 2 hr travel requested · still needs a team interpreter"), with their availability note and a link to the job's Staffing. Re-read
 * on each page change. Shows nothing while loading or on error.
 */
export function AcceptedOffersBanner() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<AcceptedOfferAlert[]>([]);

  useEffect(() => {
    let live = true;
    getAcceptedOfferAlerts()
      .then((rows) => { if (live) setAlerts(rows); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [pathname]);

  const dismiss = (ids: string[]) => {
    setAlerts((prev) => prev.filter((a) => !ids.includes(a.offerId)));
    void acknowledgeAcceptedOffers(ids);
  };

  if (alerts.length === 0) return null;
  const more = alerts.length - SHOWN;
  return (
    <div role="status" data-accepted-offers="" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          {alerts.length === 1 ? "Offer accepted" : `${alerts.length} offers accepted`}
        </p>
        {alerts.length > 1 && (
          <button type="button" onClick={() => dismiss(alerts.map((a) => a.offerId))} className="text-xs font-medium underline underline-offset-2">
            Dismiss all
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-2">
        {alerts.slice(0, SHOWN).map((a) => (
          <li key={a.offerId} className="flex items-start gap-3 rounded-xl bg-white/70 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p>{acceptedAlertLine(a)}</p>
              {a.availabilityNote && <p className="mt-0.5 text-[13px] text-emerald-900">Availability: &ldquo;{a.availabilityNote}&rdquo;</p>}
            </div>
            <Link href={`/requests/${a.requestId}#staffing`} onClick={() => dismiss([a.offerId])} className="shrink-0 rounded-full bg-[var(--forest)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--forest-hover)]">
              Staffing →
            </Link>
            <button type="button" onClick={() => dismiss([a.offerId])} aria-label="Dismiss" className="shrink-0 rounded-full p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-xs">And {more} more. Dismiss these to see them.</p>}
    </div>
  );
}
