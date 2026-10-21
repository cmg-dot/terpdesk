import { CheckCircle2 } from "lucide-react";

/**
 * Success screen for the magic-link timesheet. Shown right after submitting (by the form, then by the page itself);
 * the same link opened later shows the generic "link unavailable" message instead.
 */
export function TimesheetSubmitted({ title }: { title?: string }) {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <CheckCircle2 className="mb-4 h-14 w-14 text-emerald-600" aria-hidden="true" />
      <h1 className="mb-2 text-xl font-semibold text-gray-900">Submitted successfully</h1>
      <p className="text-[15px] text-gray-700">Your hours are now awaiting the agency&apos;s approval.</p>
      {title && <p className="mt-4 rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-600">{title}</p>}
      <p className="mt-6 text-xs text-gray-500">
        You&apos;ll get an email once they&apos;re approved. If you use the terpDESK app, this job now shows &quot;Awaiting review&quot;. You can close this page.
      </p>
    </div>
  );
}
