/**
 * A hand-written iCalendar (RFC 5545) writer for the private feed. Pure. Times are UTC ("20261207T170000Z"), so no VTIMEZONE block is
 * needed; every line ends CRLF; text values are escaped; no line is longer than 75 octets (longer ones are folded onto continuation
 * lines that start with one space, and a multi-byte character is never split). The output depends only on its input (no clock), so the
 * same events always give the same text, which is what lets the endpoint answer ETag / If-None-Match.
 */

export interface IcsEvent {
  /** Stable for the life of the thing it describes, so a calendar app updates the event instead of duplicating it. */
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  /** Becomes DTSTAMP and LAST-MODIFIED: when the thing last changed (not "now"). */
  modified: Date;
  /** Raised when the thing changes, so apps that compare it pick up the new version. */
  sequence: number;
}

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** Backslash, semicolon, comma and line breaks, as RFC 5545 section 3.3.11 asks. */
export const escapeText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** "20261207T170000Z" */
export const formatUtc = (date: Date): string =>
  `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

const octets = (text: string): number => Buffer.byteLength(text, "utf8");

/** Folds one content line (no line break in it) to at most 75 octets per physical line, never inside a character. */
export function foldLine(line: string): string {
  if (octets(line) <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let used = 0;
  for (const char of line) {
    const size = octets(char);
    // A continuation line begins with a space, which counts toward its 75.
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (used + size > limit) {
      parts.push(current);
      current = "";
      used = 0;
    }
    current += char;
    used += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const eventLines = (event: IcsEvent): string[] => [
  "BEGIN:VEVENT",
  `UID:${escapeText(event.uid)}`,
  `DTSTAMP:${formatUtc(event.modified)}`,
  `LAST-MODIFIED:${formatUtc(event.modified)}`,
  `SEQUENCE:${Math.max(0, Math.floor(event.sequence))}`,
  `DTSTART:${formatUtc(event.startsAt)}`,
  `DTEND:${formatUtc(event.endsAt)}`,
  `SUMMARY:${escapeText(event.summary)}`,
  "STATUS:CONFIRMED",
  "TRANSP:OPAQUE",
  "END:VEVENT",
];

/** The whole calendar, CRLF after every line including the last. `name` is what a calendar app calls the subscription. */
export function buildCalendar(events: readonly IcsEvent[], name: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//terpDESK//Interpreter calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
