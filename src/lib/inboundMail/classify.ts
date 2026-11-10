import { classifyStateEmail } from "@/lib/originalForms";
import { extractSrn, srnFromCandidates } from "@/lib/inboxSrn";
import { STATE_SENDER_DOMAIN, parseVoidNotice } from "@/lib/stateVoidParse";
import { topOfMessage } from "@/lib/inboundMail/topOfMessage";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * What a piece of incoming mail IS, decided from its subject, its sender and, for a reply, only the words ABOVE the quote. The
 * state's request form, its "now in process" and cancellation notices and a requester's reply are different things that used to
 * be told apart in three places with three different rules (and a cancellation was recognised only to be ignored). One function
 * now, pure, so the Inbox, the Lambda route and the tests agree.
 *
 * The rule that matters most: a REPLY from anyone but the state is correspondence. The form quoted under it is never read as a
 * request, so a "please cancel" above a pasted form is a cancellation request and not an enrichment. A FORWARD from staff is a relay
 * of the state's own mail, so its quoted text is read in full (whether the sender may act on it is the trust gate's job, later).
 */

export type InboundKind =
  | "state_request_form"
  | "state_in_process"
  | "state_cancellation"
  | "state_void"
  | "hours_report"
  | "requester_cancel_request"
  | "requester_reply"
  | "other";

export interface InboundMail {
  subject: string;
  bodyText: string;
  senderEmail: string;
}

export type CancelIntent = "clear" | "unclear";

export interface InboundClassification {
  kind: InboundKind;
  srn: string | null;
  isReply: boolean;
  isForward: boolean;
  /** state_cancellation: the state's own "Cancelled On" time (an ISO instant), when the notice states one. */
  cancelledAt: string | null;
  /** state_cancellation: the portal login the notice names ("By king"), when it names one. */
  cancelledBy: string | null;
  /** A requester's wording about cancelling: "clear" is an instruction, "unclear" is a question, a negation or a partial change. */
  intent: CancelIntent | null;
  /** The sentence that says it, with addresses and phone numbers removed and cut to a short length (for the dispatcher's banner). */
  snippet: string | null;
  /** The subject names one request number and the quoted text another: nothing may be applied to either. */
  srnConflict: boolean;
}

const REPLY_PREFIX = /^\s*(?:(?:re|fw|fwd)\s*:\s*)*re\s*:/i;
const FORWARD_PREFIX = /^\s*(?:(?:re|fw|fwd)\s*:\s*)*(?:fw|fwd)\s*:/i;
const SUBJECT_SRN = /(?:\bSRN\s*[:#]?\s*#?\s*|#\s*)(\d{6,12})\b/i;
export const SNIPPET_MAX = 160;

const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase();

// ---- cancel intent, read from the sender's own words only
const NEGATED = /\b(?:do\s*n[o']?t|don'?t|do\s+not|never|no\s+need\s+to|not\s+to)\b[^.!?\n]{0,30}\bcancel/i;
const QUESTION = /\b(?:can|could|would|should|may|might|do|does|is|are|will)\s+(?:we|you|i|they|it|this|that)\b[^.!?\n]{0,40}\bcancel|\bcancel[^.!?\n]{0,60}\?/i;
const PARTIAL = /\b(?:but|except|only|instead|rather|reschedul\w*|one\s+of|second|2nd|other)\b[^.!?\n]{0,60}\bcancel|\bcancel[^.!?\n]{0,60}\b(?:but|except|only|instead|reschedul\w*)\b/i;
const CLEAR: readonly RegExp[] = [
  /\bplease\s+cancel\b/i,
  /\b(?:need|needs|want|wants|would\s+like|wish|have)\s+to\s+cancel\b/i,
  /\bcancel(?:l?ing|l?ed)?\s+(?:this|the|that|my|our|his|her|their|it)\b/i,
  /\b(?:is|are|has\s+been|have\s+been|needs\s+to\s+be)\s+cancel+ed\b/i,
  /\bno\s+longer\s+(?:need|needed|required|necessary)\b/i,
  /^\s*cancel\b/im,
];

export function detectCancelIntent(top: string): CancelIntent | null {
  if (!/cancel|no\s+longer\s+need/i.test(top)) return null;
  if (NEGATED.test(top) || QUESTION.test(top) || PARTIAL.test(top)) return "unclear";
  return CLEAR.some((pattern) => pattern.test(top)) ? "clear" : "unclear";
}

/** The sentence that mentions cancelling, safe to show a dispatcher: no addresses, phone numbers or links, and short. */
export function cancelSnippet(top: string): string | null {
  const sentences = top.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const hit = sentences.find((s) => /cancel|no\s+longer\s+need/i.test(s));
  if (!hit) return null;
  const clean = hit
    .replace(/[\w.+-]+@[\w.-]+/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : clean;
}

// ---- the state's cancellation notice: "Cancelled On 11/9/2026 11:34:58 AM" / "By king"
const CANCELLED_ON = /Cancell?ed\s+On\s*[:\-]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)/i;
const CANCELLED_BY = /Cancell?ed\s+On[^\n]*\n[>\s]*By\s+([A-Za-z0-9._@-]{2,60})/i;

/** The notice's own time as an instant (its clock is Pacific, like every state email), or null when it is missing or not a real time. */
export function parseCancelledAt(text: string): string | null {
  const m = CANCELLED_ON.exec(text);
  if (!m) return null;
  const [month, day, year, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[5]), Number(m[6] ?? 0)];
  let hour = Number(m[4]) % 12;
  if (m[7].toUpperCase() === "PM") hour += 12;
  if (month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59 || Number(m[4]) > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  try {
    const iso = wallClockToUtc(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`, "America/Los_Angeles");
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  } catch {
    return null;
  }
}

const EMPTY = { cancelledAt: null, cancelledBy: null, intent: null, snippet: null, srnConflict: false } as const;

export function classifyInboundMail(mail: InboundMail): InboundClassification {
  const text = mail.bodyText ?? "";
  const subject = mail.subject ?? "";
  const isForward = FORWARD_PREFIX.test(subject) || /-{2,}\s*forwarded\s+message\s*-{2,}/i.test(text);
  const isReply = REPLY_PREFIX.test(subject) && !isForward;
  const fromState = domainOf(mail.senderEmail) === STATE_SENDER_DOMAIN;
  const base = { ...EMPTY, isReply, isForward };

  const voided = parseVoidNotice(subject);
  if (voided) return { ...base, kind: "state_void", srn: voided.srn };

  const kind = classifyStateEmail(subject, text);
  if (kind === "hours_report") return { ...base, kind: "hours_report", srn: extractSrn(subject, text) };

  const srn = extractSrn(subject, text);

  // The state speaking, or a person at the agency relaying it: its text is read in full.
  if (fromState || isForward) {
    if (kind === "cancellation" && srn) return { ...base, kind: "state_cancellation", srn, cancelledAt: parseCancelledAt(text), cancelledBy: CANCELLED_BY.exec(text)?.[1] ?? null };
    if (kind === "in_process" && srn) return { ...base, kind: "state_in_process", srn };
    return { ...base, kind: kind === "request_form" ? "state_request_form" : "other", srn };
  }

  // Anyone else: only their own words (above the quote) say anything about cancelling.
  const top = topOfMessage(text);
  const intent = detectCancelIntent(top);
  const subjectSrn = SUBJECT_SRN.exec(subject)?.[1] ?? null;
  const bodySrn = srnFromCandidates([extractSrn("", text)]);
  const requesterSrn = subjectSrn ?? bodySrn;
  const srnConflict = Boolean(subjectSrn && bodySrn && subjectSrn !== bodySrn);
  if (intent === "clear" && requesterSrn && !srnConflict) {
    return { ...base, kind: "requester_cancel_request", srn: requesterSrn, intent, snippet: cancelSnippet(top), srnConflict };
  }
  // Nothing above the quote is not a reply: a message that IS the form, with no words of the sender's own, is a first message.
  if (intent || isReply || (top.length > 0 && top.length < text.trim().length)) {
    return { ...base, kind: "requester_reply", srn: requesterSrn, intent, snippet: intent ? cancelSnippet(top) : null, srnConflict };
  }
  return { ...base, kind: kind === "request_form" ? "state_request_form" : "other", srn };
}
