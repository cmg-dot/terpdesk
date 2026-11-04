import { ExternalLink, Landmark } from "lucide-react";
import { buildOdhhConfirmUrl } from "@/lib/odhhPortal";

/**
 * Manual reminder for agency staff on a state job (ODHH or HCA routed through ODHH) that has someone booked: the state
 * keeps its own record, so the booking has to be confirmed on the state portal by hand. The button opens that job's own
 * confirm page (the link the state prints in its request email). The caller decides when it applies.
 */
export const OdhhPortalReminder = ({ srn }: { srn?: string | null }) => (
  <div role="note" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-2.5">
      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p>
        <span className="font-semibold">State job: confirm this booking on the ODHH portal.</span>{" "}
        An interpreter is booked here, but the state keeps its own record. Confirm the job there so both match.
      </p>
    </div>
    <a
      href={buildOdhhConfirmUrl(srn)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100"
    >
      Confirm in ODHH Portal
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  </div>
);
