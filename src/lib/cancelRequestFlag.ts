/**
 * The flag a requester's "please cancel" email leaves on a job (`data.cancelRequest`; see requesterCancel.ts for how it is set,
 * confirmed and dismissed). Pure and client-safe: the Request Detail page reads it to show the banner.
 */

export interface CancelRequestFlag {
  /** When terpDESK recorded it. */
  at: string;
  /** When the email was received. */
  receivedAt: string;
  /** The sentence that asks, with addresses and phone numbers removed and cut short. */
  snippet: string | null;
  senderEmail: string;
  /** The sender is the requester, or someone at the requester's organisation, on this job. False means: check before confirming. */
  senderMatches: boolean;
  messageId: string;
  dismissedAt?: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The flag on a job's data, or null. Safe to call with anything. */
export function cancelRequestFlagOf(data: unknown): CancelRequestFlag | null {
  const raw = (data as { cancelRequest?: unknown } | null | undefined)?.cancelRequest;
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (!str(f.at) || !str(f.messageId)) return null;
  return { at: str(f.at), receivedAt: str(f.receivedAt), snippet: str(f.snippet) || null, senderEmail: str(f.senderEmail), senderMatches: f.senderMatches === true, messageId: str(f.messageId), ...(str(f.dismissedAt) ? { dismissedAt: str(f.dismissedAt) } : {}) };
}
