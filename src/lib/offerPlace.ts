import { interpreterJobView } from "@/lib/interpreterJobData";
import { jobHeadline } from "@/lib/jobHeadline";
import { placeName } from "@/lib/jobPlaceLines";

/**
 * What every offer surface shows before the interpreter accepts (Home's offer card, the app's job page, the private offer link page),
 * built from the same allowlist (interpreterJobData.ts, "offer" access) so they can never disagree:
 *  - the header: "ODHH <SRN> - <organization>" on a state job (jobHeadline);
 *  - an in-person job's place: the clinic with its room ("OTOLARYNGOLOGY CLINIC · Ocean 8") and the street address under it;
 *  - a virtual job: only that it is virtual and its platform (the link and codes come after acceptance).
 * Never the client's name, date of birth, WA # or PA #, or the agency-private notes: the allowlist does not carry them. Pure.
 */

export interface OfferPlace {
  headline: string;
  /** The clinic / department with its room, "" on a virtual job or when the job names no place. */
  placeName: string;
  /** The street address, "" on a virtual job or when none is on file. */
  address: string;
  virtual: boolean;
  /** The platform's name on a virtual job ("Zoom"), else null. */
  platform: string | null;
}

/** The title the email link's pages (confirm, "Offer Accepted!", "already booked") show: the same header as the app's offer view. */
export const offerCardTitle = (request: { title?: string | null; data: unknown }): string => offerPlaceOf(request).headline;

export function offerPlaceOf(request: { title?: string | null; data: unknown }): OfferPlace {
  const view = interpreterJobView(request.data, "offer");
  const headline = jobHeadline({ srn: view.data.intake.odhhSrn, organization: view.organization, venue: view.onsite.venue, title: request.title });
  if (view.isVirtual) return { headline, placeName: "", address: "", virtual: true, platform: view.platform };
  return { headline, placeName: placeName(view.onsite), address: view.onsite.address ?? "", virtual: false, platform: null };
}
