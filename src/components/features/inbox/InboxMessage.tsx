import { ArrowLeft } from "lucide-react";
import { InboxEmailBody } from "@/components/features/inbox/InboxEmailBody";
import { senderLabel } from "@/components/features/inbox/InboxList";
import { formatDateInZone, getIanaZone } from "@/utils/timezone";
import type { InboxEmail } from "@/types/inbox";

interface InboxMessageProps {
  email: InboxEmail | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  onMarkUnread: () => void;
}

/** The reading pane for the selected email: loading skeleton, error, or the message itself. */
export function InboxMessage({ email, isLoading, error, onBack, onMarkUnread }: InboxMessageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--forest)] md:hidden">
          <ArrowLeft className="h-4 w-4" />
          Inbox
        </button>
        {email && (
          <button type="button" onClick={onMarkUnread} className="ml-auto rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-gray-50">
            Mark as unread
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {isLoading && (
          <div aria-busy="true" aria-label="Loading email" className="space-y-3">
            <div className="h-6 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
            <div className="mt-6 h-4 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </p>
        )}
        {email && (
          <article className="space-y-5">
            <header className="space-y-1">
              <h2 className="break-words text-xl font-semibold tracking-tight text-[var(--ink)]">{email.subject || "(no subject)"}</h2>
              <p className="break-words text-sm text-[var(--ink)]">
                {senderLabel(email)}
                {email.senderName?.trim() && <span className="text-slate-500"> &lt;{email.senderEmail}&gt;</span>}
              </p>
              <p className="text-xs text-slate-500">{formatDateInZone(email.receivedAt, getIanaZone(), "EEE, MMM d, yyyy 'at' h:mm a zzz")}</p>
            </header>
            <InboxEmailBody email={email} />
          </article>
        )}
      </div>
    </div>
  );
}
