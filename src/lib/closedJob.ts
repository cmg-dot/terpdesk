import { isPlainVoidData, isReturnedData } from "@/lib/voidReasons";

/**
 * Whether a job has been closed out: voided, returned ("unable to fill") or cancelled. Hours reported on such a job are not work
 * anyone has to review, so the review queue and its counts leave them out, and the review actions refuse them.
 *
 * A void and a return are also stored as status "Cancelled" (see voidJob.ts), so the kind is read from the job's own close-out record
 * first; a plain cancellation has none. Pure: safe in client components and on the server.
 */

export type ClosedJobKind = "voided" | "returned" | "cancelled";

interface ClosableJob {
  status?: string | null;
  canceledAt?: Date | string | null;
  data?: unknown;
}

export function closedJobKind(job: ClosableJob | null | undefined): ClosedJobKind | null {
  if (!job) return null;
  if (isReturnedData(job.data)) return "returned";
  if (isPlainVoidData(job.data)) return "voided";
  const status = String(job.status ?? "").trim().toLowerCase();
  return status === "cancelled" || status === "canceled" || Boolean(job.canceledAt) ? "cancelled" : null;
}

export const CLOSED_JOB_LABEL: Record<ClosedJobKind, string> = { voided: "Voided", returned: "Returned", cancelled: "Cancelled" };

/** What the review actions answer for a closed job. */
export const CLOSED_JOB_MESSAGE = "This job was cancelled or voided, so its hours can no longer be reviewed.";
