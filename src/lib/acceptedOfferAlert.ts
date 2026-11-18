/**
 * An interpreter's answers when accepting an offer (stored on the offer: offers.travel_requested / travel_minutes /
 * availability_note), as staff read them: in the bell and banner text, and in Staffing. Pure.
 */

/** null = not asked (assigned by staff, or accepted before the question existed). */
export interface AcceptAnswerColumns {
  travelRequested: boolean | null;
  travelMinutes: number | null;
  availabilityNote: string | null;
}

/** "2 hr", "1 hr 30 min", "45 min". */
export function travelLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

/** For the staff bell: "Travel: 2 hr requested. Availability: "10–11 only"." Empty when the questions were not asked. */
export function acceptAnswersText(a: AcceptAnswerColumns): string {
  const parts: string[] = [];
  if (a.travelRequested === true) parts.push(`Travel: ${travelLabel(a.travelMinutes ?? 0)} requested.`);
  else if (a.travelRequested === false) parts.push("No travel time needed.");
  if (a.availabilityNote) parts.push(`Availability: "${a.availabilityNote}".`);
  return parts.join(" ");
}
