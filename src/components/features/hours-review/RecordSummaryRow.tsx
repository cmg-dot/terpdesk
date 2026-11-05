import Link from "next/link";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { RecordStatusBadge } from "@/components/features/hours-review/RecordStatusBadge";
import { summarizeRecord } from "@/lib/hoursReviewSummary";
import { formatReference } from "@/utils/statusEngine";
import type { ServiceRecord } from "@/utils/hoursReviewRecords";

interface Props {
  record: ServiceRecord;
  expanded: boolean;
  onToggle: () => void;
  /** The id of the details panel this row opens (for aria-controls). */
  panelId: string;
}

const CHIP = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap";

/** The title as text, with any "SRN #202786552" kept on one line: it may wrap around the SRN, but never through it. */
function NoBreakSrn({ text }: { text: string }) {
  return (
    <>
      {text.split(/(SRN #\d+)/).map((part, i) => (/^SRN #\d+$/.test(part) ? <span key={i} className="whitespace-nowrap">{part}</span> : part))}
    </>
  );
}

/**
 * A record folded to one row (about 90px): the job and interpreter, scheduled vs actual time, mileage, signature, status, and a
 * toggle. The whole left side is the toggle button; "Open appointment" sits beside it as its own link.
 */
export function RecordSummaryRow({ record, expanded, onToggle, panelId }: Props) {
  const summary = summarizeRecord(record);
  const heading = record.title || record.reference || formatReference(record.appointmentId);
  const showReference = Boolean(record.title && record.reference && !record.title.includes(record.reference.replace("SRN ", "")));

  return (
    <div className={`flex items-center gap-2 pr-3 transition-colors hover:bg-[#FBFAF7] ${expanded ? "rounded-t-2xl" : "rounded-2xl"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0B3B32]/40 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2"
      >
        {/* Who and when. Never clipped: it keeps room for a whole SRN, and a long name or title wraps instead of being cut. */}
        <span className="block min-w-0 md:min-w-[10.5rem] md:flex-1">
          <span className="block break-words text-[15px] font-semibold text-[var(--ink)]">
            <NoBreakSrn text={heading} />
            {showReference && <span className="font-normal text-[var(--sage)]"> · {record.reference}</span>}
          </span>
          <span className="block break-words text-sm text-gray-700">
            {record.interpreterName}{record.positionIndex ? ` · Position ${record.positionIndex}` : ""} · <span className="whitespace-nowrap">{summary.dateLabel}</span>
          </span>
        </span>

        <span className="block whitespace-nowrap text-sm md:shrink-0">
          <span className="block text-[var(--ink)]">
            <span className="text-[var(--sage)]">Scheduled</span> {summary.scheduledText}
          </span>
          <span className="block text-[var(--ink)]">
            <span className="text-[var(--sage)]">Actual</span> {summary.actualText}
            {summary.difference && <span className="ml-1.5 text-xs font-medium text-amber-700">{summary.difference}</span>}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2 md:shrink-0 md:flex-nowrap md:justify-end md:gap-1.5">
          <span className={`${CHIP} bg-gray-100 text-gray-700`} title={summary.mileageNote ?? undefined}>
            {summary.mileageText}
          </span>
          {summary.signed ? (
            <span className={`${CHIP} bg-emerald-50 text-emerald-800`}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Signed
            </span>
          ) : (
            <span className={`${CHIP} bg-amber-50 text-amber-800`}>
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              No signature
            </span>
          )}
          <RecordStatusBadge state={record.state} />
          <ChevronDown className={`h-5 w-5 flex-none text-[#0B3B32] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          <span className="sr-only">{expanded ? "Hide details" : "Show details"}</span>
        </span>
      </button>

      <Link href={`/requests/${record.appointmentId}`} className="shrink-0 text-xs underline text-gray-700 transition-colors hover:text-[var(--ink)] sm:text-sm">
        Open appointment
      </Link>
    </div>
  );
}
