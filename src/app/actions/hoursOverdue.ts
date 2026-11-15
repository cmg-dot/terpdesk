"use server";

import { requireInterpreter } from "@/lib/auth/guards";
import { loadOverdueHours } from "@/lib/hoursOverdue";
import { logError } from "@/lib/logError";

/** One overdue booking, as the interpreter's banner shows it: when it ended and when hours were due (UTC ISO), and where to submit. */
export interface MyOverdueHours {
  offerId: string;
  isStateJob: boolean;
  endsAt: string;
  dueAt: string;
}

/**
 * The signed-in interpreter's bookings past the 48-business-hour deadline without hours (see src/lib/hoursOverdue.ts), worked out
 * fresh on every call so the banner is exact. Only their own bookings, and only ids and times. Empty for anyone else or on error.
 */
export async function getMyOverdueHours(): Promise<MyOverdueHours[]> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return [];
  }
  try {
    const overdue = await loadOverdueHours({ interpreterId });
    return overdue.map(({ offerId, isStateJob, endsAt, dueAt }) => ({ offerId, isStateJob, endsAt, dueAt }));
  } catch (err) {
    logError("getMyOverdueHours", err);
    return [];
  }
}
