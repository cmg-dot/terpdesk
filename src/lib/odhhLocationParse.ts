import { EMPTY_VALUE, cleanValue } from "@/lib/odhhText";

/**
 * Where an ODHH job happens, read from the form's "Location", "Address" and "Virtual Meeting/Platform" lines (pure).
 *
 * The form is used loosely: "Location" is sometimes a room code ("E1") and sometimes "Virtual-Zoom"; "Address" is sometimes
 * a street and sometimes a meeting link with the city after it ("https://teams.microsoft.com/... Vancouver, Washington
 * 98682"). This sorts each into the right place: a place name, a room code, a physical address, and a meeting link.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const TRAILING_PUNCTUATION = /[.,;)]+$/;

/** Known video platforms by hostname or name; anything else keeps the text the email gave. */
export function platformFrom(value: string): string | null {
  if (/zoom/i.test(value)) return "Zoom";
  if (/teams/i.test(value)) return "Microsoft Teams";
  if (/meet\.google|google\s*meet/i.test(value)) return "Google Meet";
  if (/webex/i.test(value)) return "Webex";
  return null;
}

/** "Virtual Meeting: Zoom https://..." -> platform "Zoom" + link. Only http(s) links are ever kept. */
export function parseMeeting(value: string | null): { platform: string | null; meetingLink: string | null } {
  if (!value || EMPTY_VALUE.test(value)) return { platform: null, meetingLink: null };
  const url = value.match(URL_PATTERN)?.[0].replace(TRAILING_PUNCTUATION, "") ?? null;
  const label = cleanValue(url ? value.replace(url, "") : value)?.replace(/[:\-–—\s]+$/, "") ?? null;
  // Free text is kept as the platform name only if it isn't a URL-like value ("javascript:...", "file:...").
  const plainLabel = label && !EMPTY_VALUE.test(label) && !/^[a-z][a-z0-9+.-]*:\S/i.test(label) ? label.slice(0, 80) : null;
  const platform = platformFrom(url ?? "") ?? platformFrom(label ?? "") ?? plainLabel;
  return { platform: platform ?? (url ? "Virtual" : null), meetingLink: url };
}

/** A line that holds a link plus the city: the link, and what is left once it is taken out ("Vancouver, Washington 98682"). */
export function splitLink(value: string | null): { rest: string | null; link: string | null } {
  if (!value) return { rest: null, link: null };
  const found = value.match(URL_PATTERN)?.[0];
  if (!found) return { rest: value, link: null };
  const rest = cleanValue(value.replace(found, " "))?.replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, "") ?? "";
  return { rest: rest && !EMPTY_VALUE.test(rest) ? rest : null, link: found.replace(TRAILING_PUNCTUATION, "") };
}

/** A short room / unit code ("E1", "A-12", "5B") rather than the name of a place. */
export const isLocationCode = (value: string): boolean => /^(?:[A-Za-z]{1,3}[ -]?\d{1,4}[A-Za-z]?|\d{1,4}[A-Za-z]{1,2})$/.test(value.trim());

/** The place name says it is online: "Virtual-Zoom", "Teams call". (Not "remote" or "video", which can be part of a real place name.) */
export const mentionsVirtual = (value: string): boolean => /\b(?:virtual(?:ly)?|zoom|teams|webex|google\s*meet|telehealth|online|vri)\b/i.test(value);

// Words that, besides the platform name, can fill a location line that only says "online".
const FILLER_WORDS = /\b(?:virtual(?:ly)?|zoom|teams|webex|google|meet|telehealth|online|vri|video|remote|meeting|call|link|room|session|microsoft|join)\b/gi;

/** The location line only says it is online ("Virtual", "Virtual-Zoom", "Zoom meeting"): it names no place. */
export const isVirtualDescriptor = (value: string): boolean => mentionsVirtual(value) && value.replace(FILLER_WORDS, "").replace(/[\s_/:.()-]+/g, "") === "";

export interface ResolvedLocation {
  /** The name of the place ("Family Solutions"); null for a room code, a "Virtual" descriptor, or no location line. */
  venue: string | null;
  /** A room / unit code from the Location line ("E1"). It is a detail of the place, never its name. */
  locationCode: string | null;
  /** The physical address, without any meeting link (a link-and-city line leaves just the city). */
  address: string | null;
  platform: string | null;
  meetingLink: string | null;
  /** The form says the job happens online: a virtual location, a platform line, or a meeting link. */
  virtual: boolean;
}

interface LocationLines {
  location: string | null;
  address: string | null;
  /** The "Virtual Meeting/Platform" line's value. */
  meetingValue: string | null;
}

export function resolveLocation({ location, address, meetingValue }: LocationLines): ResolvedLocation {
  const fromLocation = splitLink(location);
  const fromAddress = splitLink(address);
  const platformLine = parseMeeting(meetingValue);

  const place = fromLocation.rest;
  const code = place && isLocationCode(place) ? place : null;
  const descriptor = place !== null && code === null && isVirtualDescriptor(place);
  const venue = code || descriptor ? null : place;

  const meetingLink = platformLine.meetingLink ?? fromAddress.link ?? fromLocation.link;
  const platform = platformLine.platform ?? (meetingLink ? platformFrom(meetingLink) : null) ?? (place ? platformFrom(place) : null) ?? (meetingLink ? "Virtual" : null);
  const virtual = Boolean(meetingLink) || platformLine.platform !== null || (place !== null && mentionsVirtual(place));

  // An Address line that only holds the meeting invitation's words ("Microsoft Teams meeting Join:") is not a street address.
  const street = fromAddress.rest !== null && isVirtualDescriptor(fromAddress.rest) ? null : fromAddress.rest;
  return { venue, locationCode: code, address: street, platform, meetingLink, virtual };
}
