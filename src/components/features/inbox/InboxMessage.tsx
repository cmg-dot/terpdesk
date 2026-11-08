"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { InboxCategoryBadge } from "@/components/features/inbox/InboxCategoryBadge";
import { InboxEmailBody } from "@/components/features/inbox/InboxEmailBody";
import { InboxJobLink } from "@/components/features/inbox/InboxJobLink";
import { InboxParsedData } from "@/components/features/inbox/InboxParsedData";
import { senderLabel } from "@/components/features/inbox/InboxList";
import { categorize, cleanSubject } from "@/lib/inboxCategory";
import { formatDateInZone, getIanaZone } from "@/utils/timezone";
import type { InboxEmail } from "@/types/inbox";

interface InboxMessageProps {
  email: InboxEmail | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  onMarkUnread: () => void;
  /** The state request number this email is about and the job that has it, when known. */
  jobRef?: { srn: string | null; jobId: string | null };
}

type MessageTab = "parsed" | "raw";

const TABS: readonly (readonly [MessageTab, string])[] = [
  ["raw", "Raw Message"],
  ["parsed", "Parsed Data"],
];

/** The reading pane for the selected email: loading skeleton, error, or a header banner with Raw Message / Parsed Data tabs (every email opens on Raw Message). */
export function InboxMessage({ email, isLoading, error, onBack, onMarkUnread, jobRef }: InboxMessageProps) {
  const [tab, setTab] = useState<MessageTab>("raw");
  const category = email ? categorize(email.subject) : "other";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 sm:px-6 lg:px-8">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--forest)] lg:hidden">
          <ArrowLeft className="h-4 w-4" />
          Inbox
        </button>
        {email && (
          <button type="button" onClick={onMarkUnread} className="ml-auto rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-gray-50">
            Mark as unread
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div aria-busy="true" aria-label="Loading email" className="space-y-3 px-4 py-5 sm:px-6 lg:px-8">
            <div className="h-6 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="mt-6 h-4 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
          </div>
        )}
        {error && (
          <p role="alert" className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:m-6 lg:m-8">
            {error}
          </p>
        )}
        {email && (
          <article data-inbox-message={email.id}>
            <header className="space-y-3 border-b border-[rgb(var(--mint-strong-rgb)/0.7)] bg-gradient-to-b from-[rgb(var(--mint-rgb)/0.7)] to-[#FBFAF7] px-4 py-5 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center gap-2">
                <InboxCategoryBadge category={category} />
                {jobRef?.srn && <InboxJobLink srn={jobRef.srn} jobId={jobRef.jobId} showQuickLink={false} />}
              </div>
              <h2 className="break-words text-xl font-semibold tracking-tight text-[var(--ink)]">{cleanSubject(email.subject)}</h2>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
                <dt className="text-[var(--sage)]">From</dt>
                <dd className="min-w-0 break-words text-[var(--ink)]">
                  {senderLabel(email)}
                  {email.senderName?.trim() && <span className="text-slate-500"> &lt;{email.senderEmail}&gt;</span>}
                </dd>
                <dt className="text-[var(--sage)]">Date</dt>
                <dd className="text-[var(--ink)]">{formatDateInZone(email.receivedAt, getIanaZone(), "EEE, MMM d, yyyy 'at' h:mm a zzz")}</dd>
              </dl>
              {jobRef?.srn && jobRef.jobId && (
                <Link href={`/requests/${jobRef.jobId}`} data-inbox-go-to-request className="inline-flex items-center gap-2 rounded-full bg-[var(--forest)] px-4 py-2 text-sm font-medium text-[var(--canvas)] transition-opacity hover:opacity-90">
                  Go to Request #{jobRef.srn}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </header>

            <div className="px-4 pt-4 sm:px-6 lg:px-8">
              <div role="tablist" aria-label="Message view" className="inline-flex gap-1 rounded-full bg-[#F4F3EF] p-1">
                {TABS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    data-message-tab={id}
                    onClick={() => setTab(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)] ${tab === id ? "bg-white text-[var(--forest)] shadow-sm" : "text-[var(--sage)] hover:text-[var(--ink)]"}`}
                  >
                    {id === "raw" && <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              {tab === "parsed" ? (
                <InboxParsedData key={email.id} email={email} category={category} />
              ) : (
                <div data-inbox-raw className="rounded-2xl border border-gray-200 bg-white p-4">
                  <InboxEmailBody email={email} />
                </div>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
