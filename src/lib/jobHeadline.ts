import { isRealOrganization } from "@/lib/requestSummary";

/**
 * The main header of a job, the same on the agency's request page and the interpreter's screens. A state job (it has an SRN) reads
 * "ODHH <SRN> - <parent organization>" ("ODHH 202787460 - Seattle Children's Hospital"); the clinic or department stays in the
 * location block. With no organization on file the place's name stands in, then the SRN alone. Any other job keeps its organization,
 * else its title. Pure.
 */

const PLACEHOLDER_PLACES = new Set(["", "virtual", "location pending", "tbd"]);

export interface HeadlineSource {
  srn?: string | null;
  /** The requester's organization (requester.org); funding-program placeholders ("WA ODHH") do not count. */
  organization?: string | null;
  /** The venue (onsite.venue), used only when there is no organization. */
  venue?: string | null;
  title?: string | null;
}

/** The organization when it is a real one, else null. */
export const realOrganization = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return isRealOrganization(text) ? text : null;
};

export function jobHeadline({ srn, organization, venue, title }: HeadlineSource): string {
  const org = realOrganization(organization);
  const number = (srn ?? "").trim();
  if (number) {
    const place = (venue ?? "").trim();
    // A street address ("1115 Washington St SE") is never a headline: it stays in the location block.
    const who = org ?? (PLACEHOLDER_PLACES.has(place.toLowerCase()) || /^\d/.test(place) ? "" : place);
    return who ? `ODHH ${number} - ${who}` : `ODHH ${number}`;
  }
  return org ?? ((title ?? "").trim() || "Interpreting assignment");
}
