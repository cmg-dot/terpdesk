"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { bookInterpreterDirectly } from "@/lib/directAssignment";
import type { DirectAssignOutcome } from "@/lib/directAssignment";
import { sendBookingConfirmation } from "@/lib/jobEmails";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { getRosterInterpreters } from "@/lib/roster";
import { logActivity } from "@/lib/requestActivity";
import { assignInterpreterDirectlySchema } from "@/lib/validation/directAssign";
import type { AssignInterpreterDirectlyInput, JobPosition } from "@/lib/validation/directAssign";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type AssignDirectlyResult =
  | { success: true; status: string; positionIndex: JobPosition; interpreterName: string; withdrawnOffers: number; emailed: boolean }
  | { success: false; error: string };

/**
 * Agency override: books an interpreter on a job right now, with no offer and no acceptance.
 *  - the job is marked booked and the interpreter linked to it (an accepted offer plus the position's slot),
 *  - every pending offer for that position is withdrawn, so nobody else can still accept it,
 *  - the interpreter gets the "You have been assigned" email and an in-app notification.
 * Unlike auto-book it needs no permission from the interpreter. It still refuses a cancelled or already-started job,
 * an interpreter who isn't on the agency's active roster, and a position that is already filled.
 */
export async function assignInterpreterDirectly(input: AssignInterpreterDirectlyInput): Promise<AssignDirectlyResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const parsed = assignInterpreterDirectlySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose an interpreter to assign." };
  const { jobId, interpreterId, positionIndex } = parsed.data;

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
    logError("assignInterpreterDirectly", err);
    return { success: false, error: "We could not assign the interpreter. Please try again." };
  }
  if (!outcome.ok) return { success: false, error: outcome.error };

  // Committed. Everything below is best-effort and never throws, so a failed email can't undo the assignment.
  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "job_assigned_directly",
    details: `requestId=${jobId}; interpreterId=${interpreterId}; position=${positionIndex}; withdrawnOffers=${outcome.withdrawnOffers}`,
  });
  await logActivity({ requestId: jobId, interpreterId, audience: "shared", kind: "assigned", message: `Assigned directly by the agency · booked for Position ${positionIndex}`, actorLabel: "Agency staff" });
  if (outcome.withdrawnOffers > 0) {
    const n = outcome.withdrawnOffers;
    await logActivity({ requestId: jobId, kind: "offers_withdrawn", message: `${n} pending offer${n === 1 ? "" : "s"} withdrawn because Position ${positionIndex} was assigned directly`, actorLabel: "Agency staff" });
  }
  await notifyInterpreter(interpreterId, {
    type: "job",
    href: "/jobs",
    title: "You have been assigned to a job",
    message: "Your agency booked you for a job. Open it to see the details.",
  });
  const emailed = await sendBookingConfirmation({ requestId: jobId, interpreterId, positionNumber: positionIndex, kind: "assigned" });

  revalidatePath(`/requests/${jobId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/interpreter-home");

  return { success: true, status: outcome.status, positionIndex, interpreterName, withdrawnOffers: outcome.withdrawnOffers, emailed };
}
