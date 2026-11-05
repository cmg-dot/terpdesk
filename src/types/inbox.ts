/** What every view of an email carries: everything except the message body, so the list stays light. */
export interface InboxMailHeader {
  id: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  /** ISO instant the email was received. */
  receivedAt: string;
  isRead: boolean;
}

/** One row of the inbox list. */
export interface InboxListItem extends InboxMailHeader {
  /** The state request number the email is about (6 to 12 digits), or null when it names none. */
  srn: string | null;
  /** The job that has that number, or null when no job does (yet). */
  jobId: string | null;
}

/** A single email opened in the reading pane. `bodyHtml` is exactly as received and must be sanitized before display. */
export interface InboxEmail extends InboxMailHeader {
  bodyText: string;
  bodyHtml: string | null;
}

/** The newest emails shown; keeps the page light if the mailbox is ever flooded. */
export const INBOX_LIST_LIMIT = 500;

export type OpenInboxEmailResult = { success: true; email: InboxEmail } | { success: false; error: string };
export type SetInboxEmailReadResult = { success: true } | { success: false; error: string };
