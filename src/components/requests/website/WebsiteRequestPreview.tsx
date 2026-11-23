import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sage)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[14px] text-[var(--ink)]">{children}</dd>
    </div>
  );
}

/**
 * What a card shows when it is opened: the requester's name, when and where, the repeat pattern, the suggested team and how they like
 * to be reached. Email addresses, phone numbers and the free-text notes are never loaded for this page: they are on the request itself.
 */
export function WebsiteRequestPreview({ row }: { row: WebsiteRequestRow }) {
  return (
    <div className="border-t border-[var(--banner-edge)] px-5 pb-5 pt-4" data-website-preview={row.id}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {row.requesterName && <Detail label="Requester">{row.requesterName}</Detail>}
        <Detail label="When">
          {row.requestedFor.split(" · ")[0]}
          {row.timeRange && <span className="block text-[var(--sage)]">{row.timeRange}</span>}
        </Detail>
        <Detail label="Where">
          {row.location}
          {row.address && <span className="block text-[var(--sage)]">{row.address}</span>}
        </Detail>
        {row.repeats && <Detail label="Repeats">{row.recurrenceNote ? <span className="whitespace-pre-line">{row.recurrenceNote}</span> : "Yes, no pattern given"}</Detail>}
        {row.teamSuggested && <Detail label="Suggested team">{row.teamSuggested}</Detail>}
        {row.preferredContact && <Detail label="Preferred contact method">{row.preferredContact}</Detail>}
        {row.receivedLabel && <Detail label="Received">{row.receivedLabel}</Detail>}
        <Detail label="Reference">{row.reference}</Detail>
      </dl>
      <Link
        href={`/requests/${row.id}`}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--forest)] px-5 py-2 text-[13px] font-medium text-[var(--canvas)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2"
      >
        Open request
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
