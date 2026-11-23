import Link from "next/link";
import { CalendarClock, CalendarDays, Clock, MapPin, Repeat, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Expandable } from "@/components/ui/Expandable";
import { WebsiteRequestPreview } from "@/components/requests/website/WebsiteRequestPreview";
import { WebsiteStatusChip } from "@/components/requests/website/WebsiteStatusChip";
import { startsInLabel, urgencyOf, waitingLabel, waitingMinutes } from "@/lib/websiteRequestView";
import type { Urgency } from "@/lib/websiteRequestView";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--banner-edge)] bg-[var(--canvas)] px-2.5 py-0.5 text-[12px] text-[var(--sage)]";
const SIGNAL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold";

const STARTS_STYLE: Record<Urgency, string> = {
  urgent: "bg-[var(--badge)] text-[var(--badge-ink)]",
  soon: "bg-[var(--tint)] text-[var(--tint-ink)]",
  passed: "bg-slate-100 text-slate-600",
  none: "bg-[var(--canvas)] text-[var(--sage)]",
};

function Chip({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={CHIP}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function DateTile({ tile }: { tile: WebsiteRequestRow["dateTile"] }) {
  return (
    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--tint)] text-[var(--tint-ink)]" data-date-tile="">
      {tile ? (
        <>
          <span className="text-[10px] font-semibold uppercase leading-none tracking-wider">{tile.month}</span>
          <span className="mt-1 text-[20px] font-semibold leading-none">{tile.day}</span>
        </>
      ) : (
        <CalendarDays className="h-6 w-6" aria-hidden="true" />
      )}
    </span>
  );
}

function CardHeader({ row, now }: { row: WebsiteRequestRow; now: number }) {
  const urgency = urgencyOf(row, now);
  const waiting = waitingMinutes(row, now);
  const startsIn = startsInLabel(row, now);
  const when = row.timeRange ? `${row.dateTile?.weekday ?? ""} · ${row.timeRange}`.replace(/^ · /, "") : row.requestedFor;
  return (
    <span className="flex items-start gap-3 sm:gap-4">
      <DateTile tile={row.dateTile} />
      <span className="block min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-[16px] font-semibold text-[var(--ink)]" data-organization="">
            {row.organization}
          </span>
          <WebsiteStatusChip row={row} />
        </span>
        <span className="mt-0.5 block text-[13px] text-[var(--sage)]">{when}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip>{row.setting}</Chip>
          <Chip>{row.format}</Chip>
          <Chip icon={MapPin}>{row.location}</Chip>
          {row.repeats && <Chip icon={Repeat}>Repeats</Chip>}
          {row.teamSuggested === "Team of two" && <Chip icon={Users}>Team of two suggested</Chip>}
        </span>
        {(waiting !== null || startsIn) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {waiting !== null && (
              <span className={`${SIGNAL} bg-[var(--surface)] text-[var(--forest)]`} data-waiting="">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {waitingLabel(waiting)}
              </span>
            )}
            {startsIn && (
              <span className={`${SIGNAL} ${STARTS_STYLE[urgency]}`} data-starts-in="">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {startsIn}
              </span>
            )}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * One website request: the date tile, the organization, the status, the chips that say what and where, and how long it has waited and
 * how soon it starts. The row opens (inline preview) or goes straight to the request ("Review", wide screens; the preview has the same
 * link on every screen). A request that starts within 48 hours carries a rail in the theme's badge colour.
 */
export function WebsiteRequestCard({ row, now }: { row: WebsiteRequestRow; now: number }) {
  const urgency = urgencyOf(row, now);
  const rail = urgency === "urgent" ? "before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-[var(--badge)]" : "";
  return (
    <div
      role="listitem"
      data-website-request={row.id}
      data-urgency={urgency}
      className={`relative rounded-2xl border border-[var(--banner-edge)] bg-white transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${rail}`}
    >
      <Expandable name="website-request" className="rounded-2xl" headerClassName="px-4 py-4 sm:px-5 sm:pr-40" header={<CardHeader row={row} now={now} />}>
        <WebsiteRequestPreview row={row} />
      </Expandable>
      <Link
        href={`/requests/${row.id}`}
        aria-label={`${row.needsReview ? "Review" : "Open"} request ${row.reference}`}
        className="absolute right-14 top-4 hidden min-h-9 items-center rounded-full border border-[var(--forest)] px-4 text-[13px] font-medium text-[var(--forest)] transition-colors hover:bg-[var(--forest)] hover:text-[var(--canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] sm:inline-flex"
      >
        {row.needsReview ? "Review" : "Open"}
      </Link>
    </div>
  );
}
