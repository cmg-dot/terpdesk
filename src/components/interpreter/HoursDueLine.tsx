"use client";

import { hoursDueInfo } from "@/lib/hoursDue";

/**
 * "Due Thu, Nov 20, 5:00 PM PST": the deadline for submitting hours (or, with `stateForm`, the ODHH Verification Form), shown before it
 * passes. Past it, the line says so in red and the overdue banner lists the job. Nothing when the job is outside the rule.
 */
export function HoursDueLine({ endsAt, stateForm = false, nowMs }: { endsAt: string | null | undefined; stateForm?: boolean; nowMs?: number }) {
  const due = hoursDueInfo(endsAt, nowMs);
  if (!due) return null;
  const subject = stateForm ? "ODHH Verification Form" : "Hours";
  return (
    <p data-hours-due="" className={`text-xs font-medium ${due.overdue ? "text-red-700" : "text-amber-800"}`}>
      {due.overdue ? `${subject} overdue: were due ${due.when}` : `${stateForm ? `${subject} due` : "Due"} ${due.when}`}
    </p>
  );
}
