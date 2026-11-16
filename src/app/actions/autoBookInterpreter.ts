"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { checkInterpreterFit } from "@/app/actions/availability";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { readPermission } from "@/lib/agencyPermissions";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { bookWithAnnouncements } from "@/lib/directBookingFlow";
import type { AssignDirectlyResult } from "@/lib/directBookingFlow";
import { summarizeJob } from "@/lib/jobSummary";
import { logError } from "@/lib/logError";
import { assignInterpreterDirectlySchema } from "@/lib/validation/directAssign";
import type { AssignInterpreterDirectlyInput } from "@/lib/validation/directAssign";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * One-click Auto-book from the offer form: books an interpreter who has allowed this agency to auto-book them, through the same
 * booking core as Directly assign (lib/directBookingFlow.ts). Only within what the interpreter agreed to on their Agencies page: a
 * virtual job, entirely inside the availability they share, with no conflicting booking or busy time. Anything else is refused with
 * the reason, and staff send an offer instead.
 */
export async function autoBookInterpreter(input: AssignInterpreterDirectlyInput): Promise<AssignDirectlyResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = assignInterpreterDirectlySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose an interpreter to auto-book." };
  const { jobId, interpreterId, positionIndex } = parsed.data;

  try {
    const permission = await readPermission(DEFAULT_AGENCY_ID, interpreterId);
    if (!permission.allowsAutoBook) return { success: false, error: "This interpreter has not allowed your agency to auto-book them. Send an offer instead." };

    const [job] = await db.select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data }).from(requests).where(eq(requests.id, jobId)).limit(1);
    if (!job) return { success: false, error: "This request no longer exists." };
    if (!summarizeJob(job).isVirtual) return { success: false, error: "Auto-book covers virtual jobs only. Send an offer for in-person work." };

    const { startsAt, endsAt } = resolveRequestTimes(job);
    const { fit } = await checkInterpreterFit({ interpreterId, jobStartsAtUtc: startsAt, jobEndsAtUtc: endsAt });
    if (fit !== "available") return { success: false, error: "This job is outside the availability the interpreter shares, or clashes with their schedule. Send an offer instead." };
  } catch (err) {
    logError("autoBookInterpreter", err);
    return { success: false, error: "We could not check this booking. Please try again." };
  }
  return bookWithAnnouncements({ session, jobId, interpreterId, positionIndex, mode: "auto" });
}
