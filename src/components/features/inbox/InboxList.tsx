import { formatDateInZone, getIanaZone } from "@/utils/timezone";
import type { InboxListItem } from "@/types/inbox";

interface InboxListProps {
  emails: InboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The sender's name, or their address when the email carried no name. */
export const senderLabel = (email: Pick<InboxListItem, "senderName" | "senderEmail">): string => email.senderName?.trim() || email.senderEmail;

/** The scrollable list: unread emails are bold with a dot, read ones are dimmed. */
export function InboxList({ emails, selectedId, onSelect }: InboxListProps) {
  const zone = getIanaZone();
  return (
    <ul className="divide-y divide-gray-100">
      {emails.map((email) => {
        const selected = email.id === selectedId;
        return (
          <li key={email.id}>
            <button
              type="button"
              onClick={() => onSelect(email.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${selected ? "bg-[#E6EFEA]" : "hover:bg-gray-50"}`}
            >
              <span
                aria-label={email.isRead ? undefined : "Unread"}
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${email.isRead ? "bg-transparent" : "bg-[var(--forest)]"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${email.isRead ? "text-slate-500" : "font-semibold text-[var(--ink)]"}`}>{senderLabel(email)}</span>
                  <time dateTime={email.receivedAt} className={`shrink-0 text-xs ${email.isRead ? "text-slate-400" : "font-medium text-[var(--ink)]"}`}>
                    {formatDateInZone(email.receivedAt, zone)}
                  </time>
                </span>
                <span className={`mt-0.5 block truncate text-sm ${email.isRead ? "text-slate-400" : "font-medium text-[var(--ink)]"}`}>
                  {email.subject || "(no subject)"}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
