import type { PendingVerificationView } from "@/lib/verificationPending";

/**
 * How a "Needs an interpreter" report reads on its compact row. Pure, so the row, the section and the tests share one set of rules.
 */

/** How many reports show before "Show all (N)". */
export const PENDING_PREVIEW_LIMIT = 3;

/** The reports to show: the first few, or all of them once the section is opened out. */
export function previewItems<T>(items: readonly T[], showAll: boolean, limit: number = PENDING_PREVIEW_LIMIT): T[] {
  return showAll ? [...items] : items.slice(0, limit);
}

/** The button under the list: "Show all (7)" while folded, "Show fewer" once open, nothing when everything already shows. */
export function showAllLabel(total: number, showAll: boolean, limit: number = PENDING_PREVIEW_LIMIT): string | null {
  if (total <= limit) return null;
  return showAll ? "Show fewer" : `Show all (${total})`;
}

/** Whether the service was completed, as the state's report says it ("Not stated" when it left it out). */
export const completionLabel = (serviceComplete: boolean | null): string =>
  serviceComplete === null ? "Completion not stated" : serviceComplete ? "Completed" : "Not completed";

/** "Danielle Larimore (NIC)", or "No interpreter named" when the report gives no name. */
export function reportedName(report: PendingVerificationView["reportInterpreter"]): string {
  if (!report.name) return "No interpreter named";
  return report.credentials ? `${report.name} (${report.credentials})` : report.name;
}

/** The toggle's text: just the signature, or the signature and the rest of the report when it has a cancellation or a comment. */
export const detailsToggleLabel = (item: Pick<PendingVerificationView, "cancellation" | "comments">): string =>
  item.cancellation || item.comments ? "View signature & details" : "View signature";

export type CandidateTag = "Name match" | "Booked";

/** The picker's hint beside a person: the name the report gives fits them, or they are already booked on this job. */
export const candidateTag = (candidate: PendingVerificationView["candidates"][number]): CandidateTag | null =>
  candidate.suggested ? "Name match" : candidate.booked ? "Booked" : null;
