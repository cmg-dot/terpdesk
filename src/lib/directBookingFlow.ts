import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import { db } from "@/db";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { bookInterpreterDirectly } from "@/lib/directAssignment";
import type { DirectAssignOutcome } from "@/lib/directAssignment";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { getRosterInterpreters } from "@/lib/roster";
import { logActivity } from "@/lib/requestActivity";
import type { EmailOutcome } from "@/lib/timesheetEmail";
import type { JobPosition } from "@/lib/validation/directAssign";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type AssignDirectlyResult =
  | { success: true; status: string; positionIndex: JobPosition; interpreterName: string; withdrawnOffers: number; email: EmailOutcome | "failed" }
  | { success: false; error: string };

/** "direct": staff override (Directly assign). "auto": the interpreter allows this agency to auto-book them. */
export type BookingMode = "direct" | "auto";

const COPY: Record<BookingMode, { audit: string; activity: string; withdrawn: string }> = {
  direct: { audit: "job_assigned_directly", activity: "Assigned directly by the agency", withdrawn: "was assigned directly" },
  auto: { audit: "job_auto_booked", activity: "Auto-booked (the interpreter allows auto-booking)", withdrawn: "was auto-booked" },
};

/**
 * The one booking core behind Directly assign and Auto-book: books the interpreter on the position (an accepted offer plus the
 * position's slot, every pending offer for it withdrawn) in one transaction, then the audit line, the shared activity entry, the
 * interpreter's "assigned" notice (schedule banner) and the booking-confirmation email. Refuses an interpreter who isn't on the
 * agency's active roster, a cancelled or started job and a filled position. The caller has checked the role and any permission.
 * SERVER ONLY.
 */
export async function bookWithAnnouncements(params: { session: Session; jobId: string; interpreterId: string; positionIndex: JobPosition; mode: BookingMode }): Promise<AssignDirectlyResult> {
  const { session, jobId, interpreterId, positionIndex, mode } = params;
  const copy = COPY[mode];
  let outcome: DirectAssignOutcome;
  let interpreterName: string;
  try {
    // Never by id alone: the interpreter must be on this agency's active roster (also gives the display name).
    const roster = await getRosterInterpreters(DEFAULT_AGENCY_ID, { activeOnly: true });
    const person = roster.find((r) => r.id === interpreterId);
    if (!person) return { success: false, error: "That interpreter isn't on your active roster." };
    interpreterName = person.name;
    outcome = await db.transaction((tx) => bookInterpreterDirectly(tx, { requestId: jobId, interpreterId, interpreterName, positionIndex }));
  } catch (err) {
    logError(`bookWithAnnouncements:${mode}`, err);
    return { success: false, error: "We could not book the interpreter. Please try again." };
  }
  if (!outcome.ok) return { success: false, error: outcome.error };

  // Committed. Everything below is best-effort and never throws, so a failed email can't undo the booking.
  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: copy.audit,
    details: `requestId=${jobId}; interpreterId=${interpreterId}; position=${positionIndex}; withdrawnOffers=${outcome.withdrawnOffers}`,
  });
  await logActivity({ requestId: jobId, interpreterId, audience: "shared", kind: "assigned", message: `${copy.activity} · booked for ${outcome.posText}`, actorLabel: "Agency staff" });
  if (outcome.withdrawnOffers > 0) {
    const n = outcome.withdrawnOffers;
    await logActivity({ requestId: jobId, kind: "offers_withdrawn", message: `${n} pending offer${n === 1 ? "" : "s"} withdrawn because ${outcome.posText} ${copy.withdrawn}`, actorLabel: "Agency staff" });
  }
  await notifyInterpreter(interpreterId, {
    type: "job",
    href: `/jobs/${outcome.offerId}`,
    title: mode === "auto" ? "You were auto-booked for a job" : "You have been assigned to a job",
    message: "Your agency booked you for a job. Open it to see the details.",
    kind: "booking_added",
  });
  const email = await sendBookingConfirmation({ requestId: jobId, interpreterId, positionNumber: positionIndex, kind: "assigned" });

  for (const path of [`/requests/${jobId}`, "/requests", "/dashboard", "/jobs", "/interpreter-home"]) revalidatePath(path);
  return { success: true, status: outcome.status, positionIndex, interpreterName, withdrawnOffers: outcome.withdrawnOffers, email };
}
