/**
 * The agency's "Offer accepted" toast for a newly accepted offer: one line per booking staff have not seen yet, e.g.
 * "Christy accepted SRN #202787458 · 2 hr travel requested · still needs a team interpreter", with the interpreter's own
 * availability note under it. Pure.
 */

export interface AcceptedOfferAlert {
  offerId: string;
  requestId: string;
  interpreterName: string;
  /** "SRN #202787458", else the APT reference (staff screen). */
  reference: string;
  /** null = not asked (assigned by staff, or accepted before the question existed). */
  travelRequested: boolean | null;
  travelMinutes: number | null;
  availabilityNote: string | null;
  /** Positions on the job still without a booking. */
  openPositions: number;
}

/** The interpreter's answers when accepting, as stored on the offer. */
export type AcceptAnswerColumns = Pick<AcceptedOfferAlert, "travelRequested" | "travelMinutes" | "availabilityNote">;

/** "2 hr", "1 hr 30 min", "45 min". */
export function travelLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

export function acceptedAlertLine(a: AcceptedOfferAlert): string {
  const parts = [`${a.interpreterName} accepted ${a.reference}`];
  if (a.travelRequested === true) parts.push(`${travelLabel(a.travelMinutes ?? 0)} travel requested`);
  else if (a.travelRequested === false) parts.push("no travel time");
  if (a.openPositions === 1) parts.push("still needs a team interpreter");
  else if (a.openPositions > 1) parts.push(`still needs ${a.openPositions} more interpreters`);
  return parts.join(" · ");
}

/** For the staff bell: "Travel: 2 hr requested. Availability: "10–11 only"." Empty when the questions were not asked. */
export function acceptAnswersText(a: AcceptAnswerColumns): string {
  const parts: string[] = [];
  if (a.travelRequested === true) parts.push(`Travel: ${travelLabel(a.travelMinutes ?? 0)} requested.`);
  else if (a.travelRequested === false) parts.push("No travel time needed.");
  if (a.availabilityNote) parts.push(`Availability: "${a.availabilityNote}".`);
  return parts.join(" ");
}
