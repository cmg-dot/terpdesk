import { sql } from "drizzle-orm";
import { requests } from "@/db/schema";
import type { DbTx } from "@/lib/positionClaim";
import type { VerificationEffects } from "@/lib/serviceVerification";

/**
 * Two steps of the service-verification pipeline (serviceVerification.ts), kept apart so that file stays small:
 *  - which request a report belongs to: an open request with its SRN, or, for a report that says no service was given (the state's
 *    own cancellation receipt), the CANCELLED request with that SRN;
 *  - a report that cannot become hours (its times do not work, or its job is cancelled) is still SAVED on the job and staff are told,
 *    instead of being dropped.
 * SERVER ONLY. Every query is parameterized; nothing here logs a value from the report.
 */

export type ReceiptJob = Pick<typeof requests.$inferSelect, "id" | "createdAt" | "data" | "isStateJob" | "canceledAt">;

export type ReceiptMatch =
  | { kind: "none" }
  | { kind: "ambiguous"; count: number }
  | { kind: "open"; job: ReceiptJob }
  | { kind: "cancelled"; job: ReceiptJob };

const MATCH_LIMIT = 6;

/** The pure choice between the requests that carry the report's SRN. */
export function chooseReceiptJob(rows: readonly ReceiptJob[], reportsNoService: boolean): ReceiptMatch {
  const open = rows.filter((row) => row.canceledAt === null);
  if (open.length === 1) return { kind: "open", job: open[0] };
  if (open.length > 1) return { kind: "ambiguous", count: open.length };
  // No open request: a report that says the service did not happen is the state's receipt for the cancellation. It is kept on the
  // cancelled job (billing decides whether the cancellation is billable); a report of worked hours never lands on a cancelled job.
  const cancelled = rows.filter((row) => row.canceledAt !== null);
  if (!reportsNoService || cancelled.length === 0) return { kind: "none" };
  return cancelled.length === 1 ? { kind: "cancelled", job: cancelled[0] } : { kind: "ambiguous", count: cancelled.length };
}

export async function findReceiptJob(exec: DbTx, srn: string, reportsNoService: boolean): Promise<ReceiptMatch> {
  // The SRN lives in the request's JSON. The value is a bound parameter, never part of the SQL text.
  const rows = await exec
    .select({ id: requests.id, createdAt: requests.createdAt, data: requests.data, isStateJob: requests.isStateJob, canceledAt: requests.canceledAt })
    .from(requests)
    .where(sql`${requests.data} #>> '{intake,odhhSrn}' = ${srn}`)
    .limit(MATCH_LIMIT);
  return chooseReceiptJob(rows, reportsNoService);
}

/** Keeps the receipt on the request (staff-only `serviceVerification`), merged over what an earlier receipt saved. */
export async function saveReceipt(exec: DbTx, requestId: string, record: Record<string, unknown>): Promise<void> {
  await exec.execute(sql`
    UPDATE requests
    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{serviceVerification}', coalesce(data -> 'serviceVerification', '{}'::jsonb) || ${JSON.stringify(record)}::jsonb),
        updated_at = now()
    WHERE id = ${requestId}
  `);
}

export type HeldReason = "cancelled_job" | "time_problem";

/**
 * The receipt is already saved on the job; nothing else is changed (no timesheet, no status change). Staff are told in generic words
 * (security.md: no names, dates or comments in a notification). `problem` is one of computeTimes' fixed messages, never email text.
 */
export async function holdReceipt(fx: Pick<VerificationEffects, "notify" | "audit" | "refresh">, reason: HeldReason, requestId: string, problem: string | null): Promise<"cancellation_receipt" | "needs_review"> {
  if (reason === "cancelled_job") {
    await fx.notify(
      "State cancellation receipt received",
      "The state's service verification for a cancelled job was saved on the job. Check whether the cancellation is billable.",
      requestId,
    );
    await fx.audit({ action: "service_verification_received", details: `outcome=cancellation_receipt; requestId=${requestId}` });
    fx.refresh(requestId);
    return "cancellation_receipt";
  }
  await fx.notify(
    "ODHH hours need a look",
    `A service verification was saved on the job, but its hours could not be recorded automatically${problem ? ` (${problem.replace(/\.$/, "")})` : ""}. Check the report and record the hours.`,
    requestId,
  );
  await fx.audit({ action: "service_verification_received", details: `outcome=needs_review; requestId=${requestId}` });
  fx.refresh(requestId);
  return "needs_review";
}
