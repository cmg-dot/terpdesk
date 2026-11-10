import { InboxCategoryBadge } from "@/components/features/inbox/InboxCategoryBadge";
import { InboxOutcomeChip } from "@/components/features/inbox/InboxOutcomeChip";
import { InboxJobLink } from "@/components/features/inbox/InboxJobLink";
import { categorize, cleanSubject, formatInboxTime } from "@/lib/inboxCategory";
import { getIanaZone } from "@/utils/timezone";
import type { InboxListItem } from "@/types/inbox";

interface InboxListProps {
  emails: InboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The sender's name, or their address when the email carried no name. */
export const senderLabel = (email: Pick<InboxListItem, "senderName" | "senderEmail">): string => email.senderName?.trim() || email.senderEmail;

/**
 * The email feed: one soft card per email. Unread ones have an emerald dot and a bold subject; the selected one has an emerald
 * border and fill. Under the sender, time and subject: what kind of email it is, and its SRN as a blue pill that links straight to
 * the request (outside the row's button, because a link cannot sit inside one).
 */
export function InboxList({ emails, selectedId, onSelect }: InboxListProps) {
  const zone = getIanaZone();
  const now = new Date();
  return (
    <ul className="space-y-1.5 p-2">
      {emails.map((email) => {
        const selected = email.id === selectedId;
        return (
          <li key={email.id}>
            <div
              data-inbox-row={email.id}
              data-selected={selected ? "true" : "false"}
              className={`rounded-xl border transition-colors ${selected ? "border-[var(--mint-line)] bg-[var(--mint)] shadow-sm" : "border-transparent hover:border-[var(--mint-strong)] hover:bg-[rgb(var(--mint-rgb)/0.5)]"}`}
            >
              <button
                type="button"
                onClick={() => onSelect(email.id)}
                aria-current={selected ? "true" : undefined}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 pb-1.5 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)]"
              >
                <span
                  aria-label={email.isRead ? undefined : "Unread"}
                  data-unread-dot={email.isRead ? "false" : "true"}
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${email.isRead ? "bg-transparent" : "bg-[var(--mint-dot)]"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[13px] ${email.isRead ? "text-slate-500" : "font-semibold text-[var(--ink)]"}`}>{senderLabel(email)}</span>
                    <time dateTime={email.receivedAt} suppressHydrationWarning className={`shrink-0 text-[11px] ${email.isRead ? "text-slate-400" : "font-medium text-[var(--sage)]"}`}>
                      {formatInboxTime(email.receivedAt, now, zone)}
                    </time>
                  </span>
                  <span className={`mt-0.5 line-clamp-2 break-words text-sm leading-snug ${email.isRead ? "text-slate-500" : "font-semibold text-[var(--ink)]"}`}>{cleanSubject(email.subject)}</span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-3 pl-[2.125rem]">
                <InboxCategoryBadge category={categorize(email.subject, email.kind)} />
                <InboxOutcomeChip outcome={email.outcome} />
                <InboxJobLink srn={email.srn} jobId={email.jobId} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
