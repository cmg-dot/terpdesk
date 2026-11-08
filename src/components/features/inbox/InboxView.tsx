"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { InboxEmptyState } from "@/components/features/inbox/InboxEmptyState";
import { InboxHeader } from "@/components/features/inbox/InboxHeader";
import { InboxList } from "@/components/features/inbox/InboxList";
import { InboxMessage } from "@/components/features/inbox/InboxMessage";
import { InboxToolbar } from "@/components/features/inbox/InboxToolbar";
import { useInbox } from "@/hooks/useInbox";
import { matchesSearch, matchesTab, tabCounts } from "@/lib/inboxCategory";
import type { InboxTab } from "@/lib/inboxCategory";
import type { InboxListItem } from "@/types/inbox";

/**
 * The inbox: a header with the unread count, a search box and filter tabs, then two panes: the email feed on the left and the
 * selected email on the right. Below the large breakpoint (a phone or tablet) only one pane shows at a time (the feed, or the email with a Back button). Nothing is
 * selected on arrival, so an email is only marked read when someone opens it. Search and tabs only filter what is shown.
 */
export function InboxView({ emails: serverEmails }: { emails: InboxListItem[] }) {
  const { emails, unreadCount, selectedId, openEmail, isLoading, error, select, markUnread, close } = useInbox(serverEmails);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<InboxTab>("all");
  const hasSelection = selectedId !== null;

  const counts = useMemo(() => tabCounts(emails), [emails]);
  const visible = useMemo(() => emails.filter((e) => matchesTab(tab, e) && matchesSearch(query, e)), [emails, tab, query]);
  const filtering = tab !== "all" || query.trim() !== "";
  const selectedItem = emails.find((e) => e.id === selectedId);

  return (
    <div className="space-y-5">
      <InboxHeader unread={unreadCount} />
      <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white lg:h-[calc(100vh-14rem)] lg:min-h-[480px]">
        <div className={hasSelection ? "hidden lg:block" : ""}>
          <InboxToolbar query={query} onQuery={setQuery} tab={tab} onTab={setTab} counts={counts} />
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[clamp(300px,26%,380px)_minmax(0,1fr)]">
          <aside
            aria-label="Emails"
            className={`h-[calc(100vh-20rem)] min-h-[320px] overflow-y-auto bg-[#FBFAF7] lg:h-auto lg:border-r lg:border-gray-100 ${hasSelection ? "hidden lg:block" : ""}`}
          >
            {emails.length === 0 ? (
              <p className="p-6 text-sm text-[var(--sage)]">Emails sent to your intake address will appear here.</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center" data-inbox-empty="no-match">
                <SearchX className="h-7 w-7 text-[var(--sage)]" aria-hidden="true" />
                <p className="text-sm text-[var(--sage)]">No emails match{filtering ? " these filters" : ""}.</p>
                {filtering && (
                  <button type="button" onClick={() => { setQuery(""); setTab("all"); }} className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-[var(--forest)] transition-colors hover:bg-[var(--mint)]">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <InboxList emails={visible} selectedId={selectedId} onSelect={select} />
            )}
          </aside>

          <section aria-label="Email" className={`min-h-0 min-w-0 lg:block ${hasSelection ? "h-[calc(100vh-14rem)] min-h-[320px] lg:h-auto" : "hidden"}`}>
            {hasSelection ? (
              <InboxMessage key={selectedId} email={openEmail} isLoading={isLoading} error={error} onBack={close} onMarkUnread={markUnread} jobRef={selectedItem} />
            ) : (
              <InboxEmptyState />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
