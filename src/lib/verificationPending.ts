import { sameInterpreterName } from "@/lib/odhhVerificationParser";
import type { StoredSignature } from "@/lib/verificationSignature";

/**
 * A service-verification report that could not be tied to ONE booked interpreter on its own. It is kept on the request
 * (`requests.data.pendingVerifications`, staff-only) with its signature already in the private bucket, and shown in
 * Hours review until staff pick the interpreter. Pure types and functions: safe in client components.
 */

export type PendingReason = "no_booking" | "ambiguous_booking" | "no_name_match";

export const PENDING_REASON_TEXT: Record<PendingReason, string> = {
  no_booking: "Nobody is booked on this job yet.",
  ambiguous_booking: "Two interpreters are booked and the report does not say which one it is for.",
  no_name_match: "The report names someone who is not among the interpreters booked on this job.",
};

export interface PendingVerification {
  /** Short hash of the report's text: a re-sent copy of the same email is recognised and not added twice. */
  id: string;
  receivedAt: string;
  reason: PendingReason;
  /** Who the report says it is for ("Interpreter: 42 - Nivia Crest (NIC)"). */
  reportInterpreter: { id: string | null; name: string | null; credentials: string | null };
  /** UTC ISO instants, or null for a report that gives no times (cancelled / not completed). */
  actualStart: string | null;
  actualEnd: string | null;
  totalMiles: number;
  otherFeesText: string | null;
  serviceComplete: boolean | null;
  cancellation: string | null;
  cancelledBy: string | null;
  comments: string | null;
  /** Already in the private bucket; null when the email carried none or storage was unavailable. */
  signature: StoredSignature | null;
}

/** One pending report as the Hours review screen shows it. */
export interface PendingVerificationView {
  requestId: string;
  reportId: string;
  title: string;
  reference: string;
  scheduledStart: string;
  scheduledEnd: string;
  timeZone: string;
  receivedAt: string;
  reason: PendingReason;
  reasonText: string;
  reportInterpreter: PendingVerification["reportInterpreter"];
  actualStart: string | null;
  actualEnd: string | null;
  totalMiles: number;
  otherFeesText: string | null;
  serviceComplete: boolean | null;
  cancellation: string | null;
  cancelledBy: string | null;
  comments: string | null;
  /** App link that opens the stored signature (agency session required), or null when the email had none. */
  signatureUrl: string | null;
  /** The agency roster for the picker: the people the report's name fits first, then those already booked, then the rest. */
  candidates: { id: string; label: string; booked: boolean; suggested: boolean }[];
  /** The one person to pre-select: the single name match, else the single booked interpreter. */
  preselectedId: string | null;
}

export interface NamedPerson {
  id: string;
  /** Every spelling of the name (account name, preferred name). */
  names: string[];
}

/** The one interpreter in `people` the report's name belongs to; null when none, or more than one, matches. */
export function pickByReportName(people: readonly NamedPerson[], reportName: string | null | undefined): string | null {
  if (!reportName) return null;
  const hits = people.filter((p) => p.names.some((n) => sameInterpreterName(reportName, n)));
  return hits.length === 1 ? hits[0].id : null;
}

/** Ids of everyone in `people` whose name could be the report's (used to pre-select the right person for staff). */
export function suggestedIds(people: readonly NamedPerson[], reportName: string | null | undefined): string[] {
  if (!reportName) return [];
  return people.filter((p) => p.names.some((n) => sameInterpreterName(reportName, n))).map((p) => p.id);
}

/** The note that goes on the timesheet: what the state wrote. Shared by the live intake and the staff assignment. */
export function verificationNote(parts: { otherFeesText: string | null; cancellation: string | null; comments: string | null }): string {
  const lines = ["Recorded from the ODHH service verification."];
  if (parts.otherFeesText) lines.push(`Other fee(s): ${parts.otherFeesText}`);
  if (parts.cancellation) lines.push(`${parts.cancellation}.`);
  if (parts.comments) lines.push(`ODHH comments: ${parts.comments}`);
  return lines.join(" ");
}
