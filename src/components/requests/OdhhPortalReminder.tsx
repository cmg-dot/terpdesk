import { CheckCircle2, ExternalLink, Landmark } from "lucide-react";
import { buildOdhhConfirmUrl } from "@/lib/odhhPortal";

/**
 * Manual reminder for agency staff on a state job (ODHH or HCA routed through ODHH) that has someone booked: the state
 * keeps its own record, so the booking has to be confirmed on the state portal by hand. The button opens that job's own
 * confirm page (the link the state prints in its request email). Once staff have done it they can record that here
 * ("Mark Confirmed in ODHH"), and the banner turns green with an Undo. The caller decides when it applies and saves the choice.
 */

interface Props {
  srn?: string | null;
  /** True once staff recorded the portal confirmation. */
  confirmed?: boolean;
  /** Present when the caller can save the choice; without it the banner is just the reminder. */
  onConfirmedChange?: (confirmed: boolean) => void;
  busy?: boolean;
  error?: string | null;
}

const secondaryButton =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100 disabled:opacity-60";

export const OdhhPortalReminder = ({ srn, confirmed = false, onConfirmedChange, busy = false, error = null }: Props) => {
  if (confirmed) {
    return (
      <div role="status" data-odhh-banner="confirmed" className="mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <p>
            <span className="font-semibold">Confirmed in ODHH.</span> This booking was confirmed on the state portal.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
          {onConfirmedChange && (
            <button type="button" disabled={busy} onClick={() => onConfirmedChange(false)} className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100 disabled:opacity-60">
              {busy ? "Saving…" : "Undo"}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div role="note" data-odhh-banner="pending" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <p>
          <span className="font-semibold">State job: confirm this booking on the ODHH portal.</span>{" "}
          An interpreter is booked here, but the state keeps its own record. Confirm the job there so both match.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
        <a href={buildOdhhConfirmUrl(srn)} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
          Confirm in ODHH Portal
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {onConfirmedChange && (
          <button type="button" disabled={busy} onClick={() => onConfirmedChange(true)} className={secondaryButton}>
            {busy ? "Saving…" : "Mark Confirmed in ODHH"}
          </button>
        )}
      </div>
    </div>
  );
};
