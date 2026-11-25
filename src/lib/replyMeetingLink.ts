import { topOfMessage } from "@/lib/inboundMail/topOfMessage";
import { normalizeEmailText } from "@/lib/odhhEmailText";
import { liftMeetingFromNote, platformFrom } from "@/lib/odhhLocationParse";

/**
 * The meeting link a requester's REPLY gives ("Here is the link: https://dshs-telehealth.zoom.us/j/..."), read from the sender's own
 * words only: the quoted history, the signature and any link that sits below them are never read, so an old link in the quoted
 * request cannot be picked up. Only an https link on a known video-meeting host counts (the host is checked, not just the text: a
 * link to some other site that merely mentions "zoom.us" is not a meeting). Mail-security wrappers (Outlook Safe Links, Proofpoint)
 * are unwrapped. Two different meeting links in one reply are never guessed between. Pure: no I/O.
 */

/** A host counts when it is one of these or a sub-domain of one ("dshs-telehealth.zoom.us"). */
export const MEETING_HOSTS = ["zoom.us", "zoomgov.com", "teams.microsoft.com", "teams.live.com", "webex.com", "meet.google.com", "doxy.me", "gotomeeting.com", "gotomeet.me", "goto.com"] as const;

export interface ReplyMeeting {
  link: string;
  /** The link's host name ("dshs-telehealth.zoom.us"): the only part of it that is ever logged. */
  host: string;
  platform: string | null;
  meetingId: string | null;
  passcode: string | null;
}

export type ReplyMeetingRead = { kind: "found"; meeting: ReplyMeeting } | { kind: "ambiguous" } | { kind: "none" };

const MAX_LINK_LENGTH = 1000;
const URL_IN_TEXT = /https?:\/\/[^\s<>"'\]]+/gi;
const TRAILING = /[.,;:!?)\]>]+$/;
const LOOKS_LIKE_HTML = /<(?:a|div|p|br|span|body|html|table)\b[^>]*>/i;
// Where an HTML reply's own words end: a quote block (Gmail, Apple Mail, Outlook on the web).
const HTML_QUOTE_START = /<blockquote\b|class="[^"]*gmail_quote|id="(?:divRplyFwdMsg|appendonsend)"/i;
// The sender's signature: the standard "-- " delimiter and the phone and mail-app footers.
const SIGNATURE_START = /^[ \t]*--[ \t]*$|^[ \t]*(?:Sent from my\b|Get Outlook for\b)/im;
const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/** An HTML reply as lines of text, the quoted part removed, and each link's address written out (the visible text may differ). */
function htmlToText(html: string): string {
  const cut = html.search(HTML_QUOTE_START);
  const own = cut >= 0 ? html.slice(0, cut) : html;
  return normalizeEmailText(own.replace(ANCHOR, (_all, href: string, inner: string) => ` ${href} ${inner} `));
}

const unwrap = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (/(?:^|\.)safelinks\.protection\.outlook\.com$/i.test(parsed.hostname)) return parsed.searchParams.get("url") ?? url;
    if (/(?:^|\.)urldefense\.com$/i.test(parsed.hostname)) {
      const inner = /\/v3\/__(.+?)__;/.exec(parsed.pathname)?.[1];
      return inner ? decodeURIComponent(inner) : url;
    }
  } catch {
    // Not a readable address: it is dropped by the host check below.
  }
  return url;
};

const meetingUrl = (raw: string): URL | null => {
  try {
    const url = new URL(unwrap(raw.replace(TRAILING, "")));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.href.length > MAX_LINK_LENGTH) return null;
    return MEETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? url : null;
  } catch {
    return null;
  }
};

/** The sender's own words: no quoted history, no signature. */
export function ownWords(body: string): string {
  const flat = LOOKS_LIKE_HTML.test(body) ? htmlToText(body) : body.replace(/\r\n?/g, "\n");
  const top = topOfMessage(flat);
  const sig = top.search(SIGNATURE_START);
  return (sig >= 0 ? top.slice(0, sig) : top).trim();
}

export function readReplyMeeting(body: string): ReplyMeetingRead {
  const words = ownWords(body);
  const distinct = new Map<string, URL>();
  for (const found of words.match(URL_IN_TEXT) ?? []) {
    const url = meetingUrl(found);
    if (url) distinct.set(url.href.replace(/\/$/, ""), url);
  }
  if (distinct.size === 0) return { kind: "none" };
  if (distinct.size > 1) return { kind: "ambiguous" };
  const url = Array.from(distinct.values())[0];
  const lifted = liftMeetingFromNote(`${url.href}\n${words}`);
  return {
    kind: "found",
    meeting: { link: url.href, host: url.hostname.toLowerCase(), platform: platformFrom(url.hostname), meetingId: lifted?.meetingId ?? null, passcode: lifted?.passcode ?? null },
  };
}
