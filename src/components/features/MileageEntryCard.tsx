import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { MileageLegsList } from "@/components/features/MileageLegsList";
import type { MileageEntry, MileageEntryStatus } from "@/lib/mileageSummary";
import { formatDateInZone } from "@/utils/timezone";

const STATUS: Record<MileageEntryStatus, { label: string; variant: BadgeVariant }> = {
  approved: { label: "Approved", variant: "green" },
  awaiting_review: { label: "Awaiting review", variant: "amber" },
  correction_requested: { label: "Correction requested", variant: "purple" },
};

/** One job's mileage: reported vs approved, the agency's reason if it changed the figure, and the itemised legs. */
export function MileageEntryCard({ entry }: { entry: MileageEntry }) {
  const status = STATUS[entry.status];
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-[var(--sage)]">{formatDateInZone(entry.startsAt, entry.timeZone, "EEE, MMM d, yyyy")}</p>
          <h3 className="truncate text-[15px] font-medium text-[var(--ink)]">{entry.title}</h3>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--sage)]">Reported</dt>
          <dd className="text-[var(--ink)]">{entry.reportedMiles.toFixed(1)} mi</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--sage)]">Approved by the agency</dt>
          <dd className="text-[var(--ink)]">{entry.approvedMiles === null ? "Not approved yet" : `${entry.approvedMiles.toFixed(1)} mi`}</dd>
        </div>
      </dl>

      {entry.adjustmentReason && (
        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-2.5 text-xs text-[var(--ink)]">
          <span className="font-medium">Adjusted by the agency:</span> {entry.adjustmentReason}
        </p>
      )}
      {entry.mileageNote && <p className="mt-3 text-xs text-[var(--sage)]">Your note: {entry.mileageNote}</p>}

      {entry.legs.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[var(--forest)]">
            {entry.legs.length === 1 ? "1 leg" : `${entry.legs.length} legs`}
          </summary>
          <div className="mt-2">
            <MileageLegsList legs={entry.legs} />
          </div>
        </details>
      )}
    </li>
  );
}
