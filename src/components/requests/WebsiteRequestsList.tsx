import Link from "next/link";
import { Globe } from "lucide-react";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import type { WebsiteRequestRow } from "@/lib/websiteRequests";

/** The Website requests page's body: one card per request made from the public form, newest first, each opening its request. */
export function WebsiteRequestsList({ rows, loadFailed = false }: { rows: WebsiteRequestRow[]; loadFailed?: boolean }) {
  if (loadFailed) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        We could not load the website requests. Please refresh the page to try again.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8" data-website-requests="empty">
        <Globe className="w-8 h-8 text-indigo-700" aria-hidden="true" />
        <h3 className="font-medium text-[var(--ink)] mt-4 text-base">No website requests yet</h3>
        <p className="text-[var(--sage)] text-sm mt-1">New requests from the gated {DEFAULT_AGENCY_NAME} site will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3" data-website-requests="list" aria-label="Website requests">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between" data-website-request={row.id}>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-[var(--ink)]">{row.requestedFor}</span>
              <RequestStatusBadge status={row.statusLabel} />
            </div>
            <p className="text-[13px] text-[var(--sage)]">
              {row.setting} · {row.format} · {row.reference}
            </p>
            {row.receivedLabel && <p className="text-xs text-[var(--sage)]">Received {row.receivedLabel}</p>}
          </div>
          <Link
            href={`/requests/${row.id}`}
            className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-center text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-gray-50 max-sm:min-h-11"
          >
            Open request
          </Link>
        </li>
      ))}
    </ul>
  );
}
