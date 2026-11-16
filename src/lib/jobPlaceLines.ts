/**
 * How an interpreter's job cards name the place, in two lines: "Legacy Salmon Creek · Ocean 8" (the facility with its room / unit)
 * over the street address. Built from the job's `onsite` fields, which interpreterJobData.ts fills for an offer and a booking alike;
 * a virtual job (or one with no place yet) falls back to its one-line location ("Zoom (Virtual)"). Pure.
 */

export interface PlaceSource {
  location?: string | null;
  isVirtual?: boolean;
  onsite?: Record<string, unknown> | null;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
/** Placeholders the view writes into `venue` when there is no real place name. */
const NOT_A_NAME = /^(?:virtual\b|location pending$|location shared after you accept$)/i;

/** "Legacy Salmon Creek · Ocean 8", "Legacy Salmon Creek", or "" when the job has no place name. */
export function placeName(onsite: Record<string, unknown> | null | undefined): string {
  const venue = text(onsite?.venue);
  return [NOT_A_NAME.test(venue) ? "" : venue, text(onsite?.room)].filter(Boolean).join(" · ");
}

export function jobPlaceLines(job: PlaceSource): { primary: string; secondary: string } {
  const name = placeName(job.onsite);
  const address = text(job.onsite?.address);
  if (!job.isVirtual && (name || address)) return { primary: name || address, secondary: name ? address : "" };
  const [primary = "", secondary = ""] = text(job.location).split("·").map((part) => part.trim());
  return { primary, secondary };
}
