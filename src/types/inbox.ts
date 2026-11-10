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
  /** What the app decided this email is (saved when it arrived), or null for mail from before that or that it did not recognise. */
  kind: string | null;
  /** What the app did about it: applied, held for a person, flagged on the job, ignored ... Null when it did nothing. */
  outcome: string | null;
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

/** What staff see beside an opened email: the job its request number belongs to and that job's timesheets. Read-only, no names. */
export interface InboxEmailContext {
  srn: string | null;
  job: { id: string; title: string; status: string; voidedKind: string | null; voidedAt: string | null } | null;
  timesheets: { status: string; position: number | null; actualStart: string | null; actualEnd: string | null; miles: number | null; hasSignature: boolean }[];
}

export type InboxEmailContextResult = { success: true; context: InboxEmailContext } | { success: false; error: string };
