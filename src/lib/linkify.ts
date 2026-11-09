/**
 * Turning meeting-link text into safe, clickable links (pure; safe in client components and on the server).
 *
 * Only http and https links are ever made clickable. A bare video-meeting address typed without its scheme ("zoom.us/j/123",
 * "teams.microsoft.com/l/meetup-join/...") gets "https://" added. Anything else (javascript:, data:, file:, mailto:, plain words)
 * is never a link, so a hand-typed or forwarded value can not turn into a script or an unexpected target.
 */

/** Hosts of the common video platforms, accepted without a scheme. */
const MEETING_HOST = String.raw`(?:[a-z0-9-]+\.)*(?:zoom\.us|zoom\.com|zoomgov\.com|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com|gotomeeting\.com|whereby\.com)`;
const SCHEMELESS_MEETING = new RegExp(String.raw`^${MEETING_HOST}(?:[/:?#]|$)`, "i");
const HTTP_URL = /^https?:\/\/\S+$/i;
// A URL inside running text: a scheme link, or a bare video-meeting address.
const URL_IN_TEXT = new RegExp(String.raw`https?:\/\/[^\s<>"']+|\b${MEETING_HOST}(?:[/:?#][^\s<>"']*)?`, "gi");
const TRAILING = /[.,;:!?)\]}>'"]+$/;

/** The href to use for this text, or null when it is not a safe web link. Trailing punctuation and wrapping <> are ignored. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(TRAILING, "").replace(/^[<([{"']+/, "");
  if (!text || /\s/.test(text)) return null;
  const candidate = HTTP_URL.test(text) ? text : SCHEMELESS_MEETING.test(text) ? `https://${text}` : null;
  if (candidate === null) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? candidate : null;
  } catch {
    return null;
  }
}

export type LinkSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

/** Splits free text into plain and link pieces, in order, so it can be drawn with real anchors. Nothing is dropped or reworded. */
export function linkSegments(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let last = 0;
  const pushText = (value: string): void => {
    if (value) out.push({ kind: "text", text: value });
  };
  for (const match of Array.from(text.matchAll(URL_IN_TEXT))) {
    const found = match[0];
    const start = match.index ?? 0;
    const trimmed = found.replace(TRAILING, "");
    const href = normalizeUrl(trimmed);
    if (href === null) continue;
    pushText(text.slice(last, start));
    out.push({ kind: "link", text: trimmed, href });
    last = start + trimmed.length;
  }
  pushText(text.slice(last));
  return out;
}
