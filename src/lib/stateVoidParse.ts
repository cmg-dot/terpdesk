/**
 * The state's "request voided" notice, recognised from its subject: "Sign Language Interpreter Service Request Voided - SRN
 * #202786910", also as a forward ("FW:", "Fwd:", "RE:") and in shorter forms ("Request Voided - SRN #..."). Pure.
 *
 * Only the subject is read. A "Request Cancellation" notice is a different thing and is not matched.
 */

const FORWARD_PREFIX = /^(?:\s*(?:re|fw|fwd)\s*:\s*)+/i;
const VOIDED = /\b(?:service\s+)?request\s+voided\b/i;
const SRN_AFTER_LABEL = /\bSRN\s*[:#]?\s*#?\s*(\d{6,12})\b/i;
const SRN_AFTER_HASH = /#\s*(\d{6,12})\b/;

const srnIn = (text: string): string | null => SRN_AFTER_LABEL.exec(text)?.[1] ?? SRN_AFTER_HASH.exec(text)?.[1] ?? null;

export interface VoidNotice {
  srn: string;
}

export function parseVoidNotice(subject: string): VoidNotice | null {
  const clean = subject.replace(FORWARD_PREFIX, "").trim();
  if (!VOIDED.test(clean)) return null;
  const srn = srnIn(clean);
  return srn ? { srn } : null;
}

/** The state's own mail domain: a notice from it is the state speaking. */
export const STATE_SENDER_DOMAIN = "dshs.wa.gov";

/**
 * Whether an address is on the allowed list: the state's domain, or an entry in `extra` (comma-separated addresses, or
 * "@domain" for a whole domain; the STATE_VOID_TRUSTED_SENDERS setting). Registered staff are checked separately (a database look-up).
 */
export function senderAllowed(senderEmail: string, extra: string | undefined): boolean {
  const address = senderEmail.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  const domain = address.slice(at + 1);
  if (domain === STATE_SENDER_DOMAIN) return true;
  return (extra ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith("@") ? domain === entry.slice(1) : address === entry));
}
