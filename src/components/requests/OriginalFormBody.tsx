"use client";

import { useState } from "react";
import { InboxEmailBody } from "@/components/features/inbox/InboxEmailBody";
import type { OriginalFormEmail, OriginalFormsResult } from "@/lib/originalForms";

/** "Nov 4, 2:03 PM": when an email arrived, in the agency's zone. */
const arrived = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) || date.getTime() === 0 ? "" : date.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

interface Props {
  loading: boolean;
  result: OriginalFormsResult | null;
}

/**
 * What the "Original form" card shows once opened: the state's request form exactly as it arrived (sanitized by
 * InboxEmailBody, wide tables scroll inside it), one tab per request form when the state sent more than one, and the
 * later notices (booking, reassignment, ...) folded under "Related state emails (not the form)". Read-only.
 */
export function OriginalFormBody({ loading, result }: Props) {
  const [active, setActive] = useState(0);
  const [relatedOpen, setRelatedOpen] = useState<string | null>(null);
  const emails: OriginalFormEmail[] = result?.success ? result.forms : [];
  const related: OriginalFormEmail[] = result?.success ? result.related : [];
  const current = emails[Math.min(active, Math.max(emails.length - 1, 0))];

  return (
    <div data-original-form-body-wrap className="min-w-0">
      {emails.length > 1 && (
        <div role="tablist" aria-label="Emails for this job" className="flex gap-2 overflow-x-auto border-b border-gray-100 px-6 py-3 sm:px-8">
          {emails.map((email, index) => (
            <button
              key={email.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${index === active ? "bg-[var(--forest-bright)] text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {email.label}
              {arrived(email.receivedAt) && <span className="ml-1.5 font-normal opacity-80">{arrived(email.receivedAt)}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 px-6 py-5 sm:px-8">
        {loading && <p role="status" className="text-sm text-[var(--sage)]">Loading the original email…</p>}
        {!loading && result && !result.success && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
        {!loading && result?.success && !current && (
          <div role="status" className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-[var(--sage)]">
            <p className="font-medium text-[var(--ink)]">No original request form on file.</p>
            <p className="mt-1">
              {result.srn ? "Forward the state's “Interpreter Request – date – SRN” email to the intake address and it will appear here, and its details will fill in anything missing on this job." : "This job has no state SRN, so there is no state email to show."}
            </p>
          </div>
        )}
        {!loading && current && (
          <div data-original-form-body className="min-w-0">
            <p className="mb-1 break-words text-sm font-medium text-[var(--ink)]">{current.subject}</p>
            <p className="mb-4 text-xs text-[var(--sage)]">{current.savedCopy ? "The copy terpDESK saved when it created this job." : `Received ${arrived(current.receivedAt)}`}</p>
            <InboxEmailBody email={{ bodyHtml: current.bodyHtml, bodyText: current.bodyText }} />
          </div>
        )}
        {!loading && related.length > 0 && (
          <details data-related-emails className="mt-6 rounded-xl border border-gray-200">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--ink)]">Related state emails (not the form) · {related.length}</summary>
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {related.map((email) => (
                <li key={email.id} className="px-4 py-3">
                  <button type="button" onClick={() => setRelatedOpen(relatedOpen === email.id ? null : email.id)} aria-expanded={relatedOpen === email.id} className="flex w-full items-center justify-between gap-3 text-left text-[13px]">
                    <span className="font-medium text-gray-800">{email.label}</span>
                    <span className="text-xs text-[var(--sage)]">{arrived(email.receivedAt)}</span>
                  </button>
                  {relatedOpen === email.id && (
                    <div className="mt-3 min-w-0">
                      <p className="mb-2 break-words text-xs text-[var(--sage)]">{email.subject}</p>
                      <InboxEmailBody email={{ bodyHtml: email.bodyHtml, bodyText: email.bodyText }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
