"use server";

import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { bookWithAnnouncements } from "@/lib/directBookingFlow";
import type { AssignDirectlyResult } from "@/lib/directBookingFlow";
import { assignInterpreterDirectlySchema } from "@/lib/validation/directAssign";
import type { AssignInterpreterDirectlyInput } from "@/lib/validation/directAssign";

export type { AssignDirectlyResult } from "@/lib/directBookingFlow";

/**
 * Agency override: books an interpreter on a job right now, with no offer and no acceptance (lib/directBookingFlow.ts): the job is
 * booked, every pending offer for that position is withdrawn, and the interpreter gets the "assigned" email and notice. Unlike
 * auto-book it needs no permission from the interpreter. It still refuses a cancelled or already-started job, an interpreter who
 * isn't on the agency's active roster, and a position that is already filled.
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
  return bookWithAnnouncements({ session, jobId, interpreterId, positionIndex, mode: "direct" });
}
