import { CheckCircle2, Globe, SearchX } from "lucide-react";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";

const BOX = "rounded-2xl border border-[var(--banner-edge)] bg-white p-8";
const BUTTON = "mt-4 inline-flex min-h-11 items-center rounded-full border border-[var(--forest)] px-5 text-[13px] font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest)] hover:text-[var(--canvas)]";

export type EmptyKind = "none_at_all" | "queue_clear" | "no_match";

/** What the board shows instead of cards: nothing has come in yet, the queue is clear, or the filters match nothing. */
export function WebsiteRequestsEmpty({ kind, onShowHandled, onClear }: { kind: EmptyKind; onShowHandled: () => void; onClear: () => void }) {
  if (kind === "none_at_all") {
    return (
      <div className={BOX} data-website-requests="empty">
        <Globe className="h-8 w-8 text-[var(--forest)]" aria-hidden="true" />
        <h3 className="mt-4 text-base font-medium text-[var(--ink)]">No website requests yet</h3>
        <p className="mt-1 text-sm text-[var(--sage)]">New requests from the gated {DEFAULT_AGENCY_NAME} site will appear here.</p>
      </div>
    );
  }
  if (kind === "queue_clear") {
    return (
      <div className={BOX} data-website-requests="clear">
        <CheckCircle2 className="h-8 w-8 text-[var(--forest)]" aria-hidden="true" />
        <h3 className="mt-4 text-base font-medium text-[var(--ink)]">You are all caught up</h3>
        <p className="mt-1 text-sm text-[var(--sage)]">No website requests are waiting for review.</p>
        <button type="button" onClick={onShowHandled} className={BUTTON}>
          See handled requests
        </button>
      </div>
    );
  }
  return (
    <div className={BOX} data-website-requests="no-match">
      <SearchX className="h-8 w-8 text-[var(--forest)]" aria-hidden="true" />
      <h3 className="mt-4 text-base font-medium text-[var(--ink)]">No requests match</h3>
      <p className="mt-1 text-sm text-[var(--sage)]">Try a different search or clear the filters.</p>
      <button type="button" onClick={onClear} className={BUTTON}>
        Clear filters
      </button>
    </div>
  );
}
