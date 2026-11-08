import { writeAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logError";
import { logActivity } from "@/lib/requestActivity";
import { timeChangeAuditDetails, timeChangeFields, timeChangeMessage } from "@/lib/timeChange";
import type { TimeChange } from "@/lib/timeChange";

/**
 * Writes the two records of a schedule edit, from the stored instants: a `time_changed` activity entry (old and new start
 * and end, in Pacific Time, who did it) and a security-audit row (user id, email, request id, SRN, old and new ISO instants).
 * Called right after the edit is saved. SERVER ONLY. Never throws: the edit is already saved.
 */
export async function recordTimeChange(input: {
  requestId: string;
  srn: string | null;
  change: TimeChange;
  userId: string | null;
  userEmail: string | null;
  actorLabel: string | null;
}): Promise<void> {
  const { requestId, srn, change, userId, userEmail, actorLabel } = input;
  try {
    await logActivity({ requestId, kind: "time_changed", audience: "agency", message: timeChangeMessage(change), changes: timeChangeFields(change), actorLabel });
    await writeAuditLog({ userId, userEmail, action: "job_time_changed", details: timeChangeAuditDetails(requestId, srn, change) });
  } catch (err) {
    logError("recordTimeChange", err);
  }
}
