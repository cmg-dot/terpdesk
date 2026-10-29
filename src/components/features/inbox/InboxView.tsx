"use client";

import { Inbox } from "lucide-react";
import { InboxList } from "@/components/features/inbox/InboxList";
import { InboxMessage } from "@/components/features/inbox/InboxMessage";
import { useInbox } from "@/hooks/useInbox";
import type { InboxListItem } from "@/types/inbox";

/**
 * Two panes: the list on the left, the selected email on the right. On a phone only one shows at a time (the list, or the
 * email with a Back button). Nothing is selected on arrival, so an email is only marked read when someone opens it.
 */
export function InboxView({ emails: serverEmails }: { emails: InboxListItem[] }) {
  const { emails, unreadCount, selectedId, openEmail, isLoading, error, select, markUnread, close } = useInbox(serverEmails);
  const hasSelection = selectedId !== null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--sage)]">
        {emails.length === 0 ? "No emails yet" : unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}
      </p>
      <div className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white md:h-[calc(100vh-13rem)] md:min-h-[420px] md:grid-cols-[minmax(280px,360px)_1fr]">
        <aside
          aria-label="Emails"
          className={`h-[calc(100vh-14rem)] min-h-[320px] overflow-y-auto md:h-auto md:border-r md:border-gray-100 ${hasSelection ? "hidden md:block" : ""}`}
        >
          {emails.length === 0 ? (
            <p className="p-6 text-sm text-[var(--sage)]">Emails sent to your intake address will appear here.</p>
          ) : (
            <InboxList emails={emails} selectedId={selectedId} onSelect={select} />
          )}
        </aside>

        <section aria-label="Email" className={`min-w-0 md:block ${hasSelection ? "h-[calc(100vh-14rem)] min-h-[320px] md:h-auto" : "hidden"}`}>
          {hasSelection ? (
            <InboxMessage email={openEmail} isLoading={isLoading} error={error} onBack={close} onMarkUnread={markUnread} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[var(--sage)]">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Select an email to read it.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
