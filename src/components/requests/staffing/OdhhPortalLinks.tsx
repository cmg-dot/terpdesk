"use client";

import type { ReactNode } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { ODHH_CONSUMER_INFO_URL, ODHH_REBOOK_URL } from "@/lib/odhhPortal";

/** The state job's own numbers, which both ODHH pages ask for (they are static pages: the values are typed or pasted there). */
export interface OdhhIds {
  srn: string;
  accessCode: string;
}

const linkClass =
  "inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-gray-50";

/** "SRN 1234567890 [copy]" / "Access code ABC [copy]", or "not on file". Staff-only values; nothing is logged. */
function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--sage)]">
      {label}{" "}
      {value ? (
        <>
          <span className="font-medium tabular-nums text-[var(--ink)]">{value}</span>
          <CopyButton text={value} label={label} />
        </>
      ) : (
        <span className="italic text-gray-400">not on file</span>
      )}
    </span>
  );
}

function PortalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** The row under the billing boxes on a state job: the two ODHH pages, with the SRN and access code ready to copy into them. */
export function OdhhPortalLinksRow({ ids }: { ids: OdhhIds }) {
  return (
    <div data-odhh-links="" className="mb-6 flex flex-col gap-2 rounded-xl border border-gray-200 bg-[#FBFAF7] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-[var(--ink)]">ODHH portal</span>
        <CopyValue label="SRN" value={ids.srn} />
        <CopyValue label="Access code" value={ids.accessCode} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PortalLink href={ODHH_CONSUMER_INFO_URL}>ODHH Consumer Info</PortalLink>
        <PortalLink href={ODHH_REBOOK_URL}>ODHH Rebook Access</PortalLink>
      </div>
    </div>
  );
}

/** Shown on a state job that needs a replacement: rebooking starts on the state's Rebook page, which asks for these two numbers. */
export function OdhhRebookBanner({ ids }: { ids: OdhhIds }) {
  return (
    <div role="note" data-odhh-rebook="" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-3.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            <span className="font-semibold">Needs replacement: rebook on the ODHH portal.</span> Open Rebook Access and enter the SRN and access code.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <CopyValue label="SRN" value={ids.srn} />
            <CopyValue label="Access code" value={ids.accessCode} />
          </div>
        </div>
      </div>
      <a
        href={ODHH_REBOOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100"
      >
        ODHH Rebook Access
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
