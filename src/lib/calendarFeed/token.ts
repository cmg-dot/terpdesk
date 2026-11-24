import { createHash, randomBytes } from "node:crypto";

/**
 * The secret in a calendar feed address. 32 random bytes written as 43 URL-safe characters (256 bits: not guessable), shown to the
 * interpreter once and stored only as its SHA-256 (security.md 3). Plain server code.
 */

/** 32 bytes in base64url is 43 characters, no padding. */
export const FEED_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateFeedToken = (): string => randomBytes(32).toString("base64url");

export const hashFeedToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * The secret out of the address segment. Calendar apps are given `<secret>.ics` so the address looks like a calendar file; the suffix is
 * optional here. Anything that is not exactly a secret (wrong length, odd characters, a path trick) is null, which the route answers
 * with the same 404 as an unknown or revoked secret.
 */
export function parseFeedToken(segment: string | undefined): string | null {
  if (typeof segment !== "string") return null;
  const bare = segment.toLowerCase().endsWith(".ics") ? segment.slice(0, -4) : segment;
  return FEED_TOKEN_PATTERN.test(bare) ? bare : null;
}

/** The address a calendar app subscribes to. */
export const feedUrl = (origin: string, token: string): string => `${origin}/api/calendar/feed/${token}.ics`;
