import { formatInTimeZone } from "date-fns-tz";
import type { InboxListItem } from "@/types/inbox";

/**
 * How the inbox sorts and finds its emails, from what each one says in its subject: the kind of email (for the badge and the
 * tabs), the subject without its "FW:" / "RE:" prefixes, the search, and the short timestamp. Pure; nothing is stored.
 */

export type InboxCategory = "slicr" | "request" | "void" | "notice" | "other";
export type InboxTab = "all" | "unread" | "requests" | "slicr" | "voids";

export const INBOX_TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "requests", label: "Requests" },
  { id: "slicr", label: "SLICR Reports" },
  { id: "voids", label: "Voids" },
];

const FORWARD_PREFIX = /^(?:\s*(?:re|fw|fwd)\s*:\s*)+/i;

/** The subject without "FW:", "Fwd:" or "RE:" in front. */
export const cleanSubject = (subject: string): string => subject.replace(FORWARD_PREFIX, "").trim() || "(no subject)";

export function categorize(subject: string): InboxCategory {
  const s = cleanSubject(subject);
  if (/\brequest\s+voided\b/i.test(s)) return "void";
  if (/\bSLICR\b|assignment\s+report/i.test(s)) return "slicr";
  if (/\b(?:cancellation|cancelled|reassignment)\b/i.test(s)) return "notice";
  if (/interpreter\s+request/i.test(s)) return "request";
  return "other";
}

/** What each kind of email is called on its badge. (The badge's colours live with the component: Tailwind only reads class names in components and the app folder.) */
export const CATEGORY_LABEL: Record<InboxCategory, string> = {
  slicr: "SLICR Report",
  request: "State Request",
  void: "Void",
  notice: "Notice",
  other: "Email",
};

export function matchesTab(tab: InboxTab, email: Pick<InboxListItem, "subject" | "isRead">): boolean {
  if (tab === "all") return true;
  if (tab === "unread") return !email.isRead;
  const category = categorize(email.subject);
  if (tab === "requests") return category === "request";
  if (tab === "slicr") return category === "slicr";
  // "Voids": the state voiding a request, and the neighbouring notices (cancellations, reassignments).
  return category === "void" || category === "notice";
}

/** True when every word of the query is in the subject, the sender's name or address, or the SRN. */
export function matchesSearch(query: string, email: Pick<InboxListItem, "subject" | "senderName" | "senderEmail" | "srn">): boolean {
  const words = query.trim().toLowerCase().replace(/#/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [email.subject, email.senderName ?? "", email.senderEmail, email.srn ?? ""].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function tabCounts(emails: readonly Pick<InboxListItem, "subject" | "isRead">[]): Record<InboxTab, number> {
  const counts: Record<InboxTab, number> = { all: emails.length, unread: 0, requests: 0, slicr: 0, voids: 0 };
  for (const email of emails) {
    if (!email.isRead) counts.unread += 1;
    const category = categorize(email.subject);
    if (category === "request") counts.requests += 1;
    else if (category === "slicr") counts.slicr += 1;
    else if (category === "void" || category === "notice") counts.voids += 1;
  }
  return counts;
}

/** "Today · 2:15 PM", "Yesterday · 9:03 AM", "Nov 6 · 2:15 PM" (with the year when it is not this year). */
export function formatInboxTime(iso: string, now: Date, zone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = (d: Date) => formatInTimeZone(d, zone, "yyyy-MM-dd");
  const time = formatInTimeZone(at, zone, "h:mm a");
  if (day(at) === day(now)) return `Today · ${time}`;
  if (day(at) === day(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `Yesterday · ${time}`;
  const sameYear = formatInTimeZone(at, zone, "yyyy") === formatInTimeZone(now, zone, "yyyy");
  return `${formatInTimeZone(at, zone, sameYear ? "MMM d" : "MMM d, yyyy")} · ${time}`;
}
