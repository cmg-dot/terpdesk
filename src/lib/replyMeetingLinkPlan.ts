import type { ReplyMeeting } from "@/lib/replyMeetingLink";

/**
 * What a reply's meeting link does to a job's data. Fill-only: a job that already has a meeting link is never changed (a different
 * link is reported to staff instead). Pure: no I/O.
 */

type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value);
const asBag = (value: unknown): Bag => (isBag(value) ? value : {});
const text = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

export type LinkPlan =
  | { kind: "apply"; data: Bag; changed: string[] }
  /** The job already has exactly this link (a repeat delivery). */
  | { kind: "same" }
  /** The job has another meeting link: kept. */
  | { kind: "different" }
  /** The job is not virtual or hybrid: staff decide. */
  | { kind: "not_virtual" };

/** The link on the job, wherever it is kept (see mapRequestRow.ts: details first, then the top level). */
export function currentMeetingLink(data: Bag): string {
  const details = asBag(data.details);
  return text(details.meetingLink) || text(details.virtualLink) || text(data.meetingLink) || text(data.virtualLink);
}

/** A platform that is only the form's placeholder ("Link in request email") or the generic default: a real name may replace it. */
const isPlaceholderPlatform = (platform: string): boolean => platform === "" || /^virtual$/i.test(platform) || /^link\b.*\b(?:email|request)\b/i.test(platform);

const sameLink = (a: string, b: string): boolean => a.replace(/\/$/, "").toLowerCase() === b.replace(/\/$/, "").toLowerCase();

const isVirtualJob = (data: Bag): boolean => {
  const details = asBag(data.details);
  const kind = `${text(details.formatCode)} ${text(details.format)}`.toLowerCase();
  return /virtual|hybrid/.test(kind);
};

export function planReplyLink(data: Bag, meeting: ReplyMeeting): LinkPlan {
  const current = currentMeetingLink(data);
  if (current) return sameLink(current, meeting.link) ? { kind: "same" } : { kind: "different" };
  if (!isVirtualJob(data)) return { kind: "not_virtual" };
  const details = { ...asBag(data.details) };
  const changed = ["details.meetingLink"];
  details.meetingLink = meeting.link;
  details.virtualLink = meeting.link;
  if (meeting.platform && isPlaceholderPlatform(text(details.platform))) {
    details.platform = meeting.platform;
    changed.push("details.platform");
  }
  if (meeting.meetingId && !text(details.meetingId)) {
    details.meetingId = meeting.meetingId;
    changed.push("details.meetingId");
  }
  if (meeting.passcode && !text(details.passcode) && !text(details.accessCode)) {
    details.passcode = meeting.passcode;
    changed.push("details.passcode");
  }
  return { kind: "apply", data: { ...data, details }, changed };
}

/** The addresses the job itself names: the requester and the billing contacts. A reply from one of them is from someone on the job. */
export function jobContactEmails(data: Bag): string[] {
  const requester = asBag(data.requester);
  return [text(requester.email), text(requester.billEmail)]
    .flatMap((value) => value.split(/[;,\s]+/))
    .map((address) => address.toLowerCase())
    .filter((address) => address.includes("@"));
}

export const isJobContact = (data: Bag, senderEmail: string): boolean => jobContactEmails(data).includes(senderEmail.trim().toLowerCase());

const SECRET_FIELDS: ReadonlySet<string> = new Set(["Meeting link", "Meeting ID", "Passcode"]);

/**
 * The change lines the booked interpreters' activity log keeps: the link, meeting ID and passcode are named, never copied into it
 * (the interpreter reads them on the job page).
 */
export function redactMeetingChanges<T extends { field: string; from: string; to: string }>(changes: readonly T[]): T[] {
  return changes.map((change) => (SECRET_FIELDS.has(change.field) ? { ...change, from: change.from === "(none)" ? "(none)" : "(set)", to: "(added)" } : change));
}
