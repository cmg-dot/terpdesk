/** One row of the inbox list: everything except the message body, so the list stays light. */
export interface InboxListItem {
  id: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  /** ISO instant the email was received. */
  receivedAt: string;
  isRead: boolean;
}

/** A single email opened in the reading pane. `bodyHtml` is exactly as received and must be sanitized before display. */
export interface InboxEmail extends InboxListItem {
  bodyText: string;
  bodyHtml: string | null;
}

/** The newest emails shown; keeps the page light if the mailbox is ever flooded. */
export const INBOX_LIST_LIMIT = 500;

export type OpenInboxEmailResult = { success: true; email: InboxEmail } | { success: false; error: string };
export type SetInboxEmailReadResult = { success: true } | { success: false; error: string };
