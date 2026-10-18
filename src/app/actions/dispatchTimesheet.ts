"use server";

import { requireRole, NOT_ALLOWED_MESSAGE } from "@/lib/auth/guards";
import { dispatchTimesheetCore } from "@/lib/timesheetDispatch";
import type { DispatchTimesheetInput, DispatchTimesheetResult } from "@/lib/timesheetDispatch";

export type { DispatchTimesheetResult };

/** Agency "Request Timesheet" button. The shared logic lives in `lib/timesheetDispatch.ts`. */
export async function dispatchTimesheet(input: DispatchTimesheetInput): Promise<DispatchTimesheetResult> {
  try {
    await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  try {
    return await dispatchTimesheetCore(input);
  } catch (err) {
    // Log only the error class/code; messages can embed row data.
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[dispatchTimesheet] failed (code: ${code})`);
    return { success: false, error: "Could not send the timesheet request. Please try again." };
  }
}
