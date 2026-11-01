import type { InterpreterFitStatus } from "@/app/actions/availability";

/**
 * Which availability results stop a standard offer (Create offer). Shared by the form (disabled button + message)
 * and by createOffer on the server, so the two can't disagree.
 *  - "unavailable": double-booked, or a private busy block. The two are one status on purpose: the reason is never
 *    revealed (no titles or details of someone's calendar).
 *  - "outside_hours": the job falls outside their usual working hours for that day.
 * "Not shared" / "not provided" only mean the agency can't tell, so they don't block.
 * The Directly assign override ignores all of this.
 */
export interface OfferBlock {
  message: string;
  tone: "red" | "amber";
}

const OVERRIDE_HINT = 'To book them anyway, use "Directly assign interpreter" below.';

export function offerBlock(fit: InterpreterFitStatus | string | null | undefined, name: string): OfferBlock | null {
  if (fit === "unavailable") {
    return { tone: "red", message: `Cannot send offer: ${name} is unavailable at this time (a conflicting booking or commitment). ${OVERRIDE_HINT}` };
  }
  if (fit === "outside_hours") {
    return { tone: "amber", message: `Cannot send offer: ${name} is outside their usual working hours at this time. ${OVERRIDE_HINT}` };
  }
  return null;
}
