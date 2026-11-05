"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";
import { getOriginalForms } from "@/app/actions/originalForms";
import { InboxEmailBody } from "@/components/features/inbox/InboxEmailBody";
import type { OriginalFormEmail, OriginalFormsResult } from "@/lib/originalForms";

/** "Nov 4, 2:03 PM": when an email arrived, in the agency's zone. */
const arrived = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) || date.getTime() === 0 ? "" : date.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * "View original form": the state's own email for this job, exactly as it arrived, in a side panel, so staff can check
 * whether the right form was sent without leaving the appointment (or cluttering its dispatch controls). Opens on demand
 * (nothing is loaded until it is clicked), shows ONLY the request form (hours reports never appear), keeps later notices
 * (booking, reassignment, ...) collapsed under "Related state emails (not the form)", and sanitizes the HTML before
 * showing it. Read-only.
 */
const DEFAULT_TRIGGER = "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50";

export function OriginalFormPanel({ requestId, triggerClassName = DEFAULT_TRIGGER }: { requestId: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OriginalFormsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [relatedOpen, setRelatedOpen] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await getOriginalForms(requestId).catch((): OriginalFormsResult => ({ success: false, error: "We could not load the original email. Please try again." })));
    setLoading(false);
  }, [requestId]);

  const openPanel = () => {
    setOpen(true);
    setActive(0);
    setRelatedOpen(null);
    void load();
  };
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const emails: OriginalFormEmail[] = result?.success ? result.forms : [];
  const related: OriginalFormEmail[] = result?.success ? result.related : [];
  const current = emails[Math.min(active, Math.max(emails.length - 1, 0))];

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={openPanel}
        className={triggerClassName}
      >
        <FileText className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        View original form
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60]" data-original-form-panel>
            <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label="Original form from the state"
              tabIndex={-1}
              className="absolute right-0 top-0 flex h-full w-full max-w-[680px] flex-col bg-white shadow-2xl outline-none"
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--ink)]">Original form</h2>
                  <p className="text-xs text-[var(--sage)]">{result?.success && result.srn ? `State SRN ${result.srn} · ` : ""}As the state sent it. Read-only.</p>
                </div>
                <button type="button" onClick={close} aria-label="Close" className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {emails.length > 1 && (
                <div role="tablist" aria-label="Emails for this job" className="flex gap-2 overflow-x-auto border-b border-gray-100 px-6 py-3">
                  {emails.map((email, index) => (
                    <button
                      key={email.id}
                      type="button"
                      role="tab"
                      aria-selected={index === active}
                      onClick={() => setActive(index)}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${index === active ? "bg-[#145347] text-white" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                    >
                      {email.label}
                      {arrived(email.receivedAt) && <span className="ml-1.5 font-normal opacity-80">{arrived(email.receivedAt)}</span>}
                    </button>
                  ))}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
                  <div data-original-form-body>
                    <p className="mb-1 text-sm font-medium text-[var(--ink)]">{current.subject}</p>
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
                            <div className="mt-3">
                              <p className="mb-2 text-xs text-[var(--sage)]">{email.subject}</p>
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
          </div>,
          document.body,
        )}
    </>
  );
}
