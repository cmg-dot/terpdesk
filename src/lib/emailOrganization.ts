import { isRealOrganization } from "@/lib/requestSummary";
import { looksLikeOrganization } from "@/lib/stateOrganization";

/**
 * The organization an offer email may name ("Seattle Children's Hospital", "DVR", "WASILC", "DCYF"). The request's organization
 * fields hold whatever staff or a form wrote, and on older jobs the billing field holds a contact's NAME, an email or a phone
 * number, none of which may go in an email. So a value is used only when it looks like a clean organization name:
 *  - it names an organization (a word such as Hospital, Clinic, University, Services) or is a known agency acronym or health system;
 *  - it holds no email address, link, phone number or number of 4 or more digits;
 *  - it is not a funding-program placeholder ("WA ODHH") and is not longer than 100 characters.
 * Anything else, including a bare two-word name such as a person's, gives null and the email simply has no Organization row. Pure.
 */

/** Agencies written as acronyms (whole words, upper case) and health systems whose name has no organization word. */
const KNOWN_ACRONYMS = /\b(?:DVR|DSHS|DCYF|WASILC|DSB|ODHH|HCA|DOC|DOH|OSPI|ESD|DDA|ALTSA|BHA|WSU|UW|UWMC|LNI|L&I)\b/;
const KNOWN_SYSTEMS = /\b(?:kaiser|permanente|harborview|multicare|overlake|virginia mason)\b/i;
const MAX_LENGTH = 100;

const cleaned = (value: unknown): string =>
  (typeof value === "string" ? value : "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "");

/** The organization when it is safe to email, else null. */
export function sanitizeOrganization(value: unknown): string | null {
  const text = cleaned(value);
  if (text.length < 2 || text.length > MAX_LENGTH || !isRealOrganization(text)) return null;
  if (/@|https?:|www\.|\.(?:com|org|net|gov|edu)\b/i.test(text)) return null;
  if ((text.match(/\d/g)?.length ?? 0) >= 4) return null;
  const named = looksLikeOrganization(text) || KNOWN_ACRONYMS.test(text) || KNOWN_SYSTEMS.test(text);
  return named ? text : null;
}

type Loose = Record<string, unknown>;
const asLoose = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});

/**
 * The request's organization for an offer email: the billing organization, else the requester's organization, whichever is the first
 * that passes sanitizeOrganization (so a contact's name in the billing field falls through to the organization).
 */
export function emailOrganization(requestData: unknown): string | null {
  const requester = asLoose(asLoose(requestData).requester);
  for (const candidate of [requester.billOrg, requester.org]) {
    const safe = sanitizeOrganization(candidate);
    if (safe) return safe;
  }
  return null;
}
