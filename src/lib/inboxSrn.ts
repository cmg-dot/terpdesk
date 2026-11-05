import { sanitizeSrn } from "@/lib/odhhEmailParser";

/**
 * The state request number an inbox email is about, read from its subject and the start of its body, so the inbox can link the
 * email to the job. The patterns are the intake parser's own (see SRN_PATTERNS in odhhEmailParser.ts), written for Postgres'
 * `substring(... from <regex>)` so the database finds them without sending whole email bodies to the server. Pure.
 */

/** "Service Request # 202786930", "Service Request Number: 202786930". Capture group 1 is the number. */
export const BODY_SERVICE_REQUEST_SQL_PATTERN = String.raw`(?i)service\s+request\s*(?:#|no\.?|number)\s*:?\s*#?\s*([a-z0-9-]+)`;
/** "SRN: 202786930", "SRN #202786930". */
export const BODY_SRN_SQL_PATTERN = String.raw`(?i)\msrn\s*[:#]?\s*#?\s*([a-z0-9-]+)`;
/** "Interpreter Request - 12/7/2026 - #202786930". */
export const SUBJECT_SRN_SQL_PATTERN = String.raw`#\s*([0-9]{6,12})`;

/** How much of an email's body is searched. A state form puts its number near the top. */
export const SRN_SEARCH_CHARS = 20000;

/** A state request number is 6 to 12 digits; anything else the patterns caught ("not", "pending") is not a number. */
export function srnFromCandidates(candidates: readonly (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const srn = sanitizeSrn(candidate ?? undefined);
    if (srn && /^[0-9]{6,12}$/.test(srn)) return srn;
  }
  return null;
}
