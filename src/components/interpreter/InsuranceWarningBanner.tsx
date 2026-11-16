"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getMyInsuranceWarnings } from "@/app/actions/insurance";
import { formatDay } from "@/components/profile/credentialFormat";
import { INSURANCE_LABEL } from "@/lib/insurance";
import type { InsuranceWarning } from "@/lib/insurance";

/**
 * On the interpreter's Home: a policy (Liability, or Commercial Auto when they have one) that has expired or expires within 30 days,
 * with a link to update it on My Profile. Worked out by the server on each visit; nothing while loading, on error or when all is current.
 */
export function InsuranceWarningBanner() {
  const [warnings, setWarnings] = useState<InsuranceWarning[]>([]);
  useEffect(() => {
    let live = true;
    getMyInsuranceWarnings()
      .then((rows) => { if (live) setWarnings(rows); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (warnings.length === 0) return null;
  const expired = warnings.some((w) => w.expired);
  return (
    <div role="alert" data-insurance-warning="" className={`rounded-2xl border px-5 py-4 text-sm ${expired ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          {warnings.map((w) => (
            <p key={w.kind}>
              <span className="font-semibold">{INSURANCE_LABEL[w.kind]}</span>{" "}
              {w.expired ? `expired on ${formatDay(w.expirationDate)}.` : w.days === 0 ? "expires today." : `expires on ${formatDay(w.expirationDate)} (in ${w.days} ${w.days === 1 ? "day" : "days"}).`}
            </p>
          ))}
          <Link href="/profile" className="inline-block font-medium underline underline-offset-2">Update your insurance</Link>
        </div>
      </div>
    </div>
  );
}
