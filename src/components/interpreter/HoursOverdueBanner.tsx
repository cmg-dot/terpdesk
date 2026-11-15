"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AlarmClock, ExternalLink } from "lucide-react";
import { getMyOverdueHours } from "@/app/actions/hoursOverdue";
import type { MyOverdueHours } from "@/app/actions/hoursOverdue";
import { ODHH_VERIFICATION_FORM_URL } from "@/lib/odhhPortal";

const ZONE = "America/Los_Angeles";
const SHOWN = 3;
const day = (iso: string): string => formatInTimeZone(new Date(iso), ZONE, "EEE, MMM d");
const due = (iso: string): string => formatInTimeZone(new Date(iso), ZONE, "EEE, MMM d 'at' h:mm a zzz");

const button =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-300 bg-white px-3.5 py-1.5 text-xs font-medium text-red-900 transition-colors hover:bg-red-100";

/**
 * "Hours overdue": stays on the interpreter's home and Jobs pages for every booking past its 48-business-hour deadline (Mon-Fri,
 * Pacific) until hours arrive. Worked out by the server on each visit, so it is exact; it shows nothing while loading or on error.
 * A state job links to the ODHH Verification Form, any other job to its page in terpDESK.
 */
export function HoursOverdueBanner() {
  const [items, setItems] = useState<MyOverdueHours[]>([]);

  useEffect(() => {
    let live = true;
    getMyOverdueHours()
      .then((rows) => { if (live) setItems(rows); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (items.length === 0) return null;
  const more = items.length - SHOWN;

  return (
    <div role="alert" data-hours-overdue="" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
      <div className="flex items-start gap-2.5">
        <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p>
            <span className="font-semibold">{items.length === 1 ? "Hours overdue." : `Hours overdue for ${items.length} assignments.`}</span>{" "}
            Hours are due within 48 business hours (Monday to Friday) after an assignment ends.
          </p>
          <ul className="space-y-1.5">
            {items.slice(0, SHOWN).map((item) => (
              <li key={item.offerId} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Assignment on {day(item.endsAt)}: due {due(item.dueAt)}
                </span>
                {item.isStateJob ? (
                  <a href={ODHH_VERIFICATION_FORM_URL} target="_blank" rel="noopener noreferrer" className={button}>
                    ODHH Verification Form
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <Link href={`/jobs/${item.offerId}`} className={button}>Submit hours</Link>
                )}
              </li>
            ))}
          </ul>
          {more > 0 && <p className="text-xs text-red-800">And {more} more under Jobs → Needs hours.</p>}
        </div>
      </div>
    </div>
  );
}
