import { createHash } from "crypto";
import { inArray, sql } from "drizzle-orm";
import { interpreters } from "@/db/schema";
import { interpreterDisplayName } from "@/lib/displayNameSql";
import type { DbTx } from "@/lib/positionClaim";
import { pickByReportName } from "@/lib/verificationPending";
import type { PendingReason, PendingVerification } from "@/lib/verificationPending";

/**
 * Server-side half of pending verifications: choosing the booked interpreter a report belongs to, and parking a report
 * that can't be matched. Every query is parameterized and takes the executor (a transaction in tests and replays).
 * SERVER ONLY.
 */

/** Same id for the same email text, so a re-sent report is recognised. */
export const reportIdFor = (rawContent: string): string => createHash("sha256").update(rawContent).digest("hex").slice(0, 24);

export type Resolution = { kind: "booked"; interpreterId: string } | { kind: "pending"; reason: PendingReason };

/**
 * Which booked interpreter is this report for?
 *  - exactly one is booked: that one (the report's name is not second-guessed, so a nickname never blocks a normal job);
 *  - several are booked: the one whose name the report gives, if exactly one matches; otherwise it waits for staff;
 *  - nobody is booked: it waits for staff.
 */
export async function resolveBookedInterpreter(exec: DbTx, bookedIds: readonly string[], reportName: string | null): Promise<Resolution> {
  if (bookedIds.length === 1) return { kind: "booked", interpreterId: bookedIds[0] };
  if (bookedIds.length === 0) return { kind: "pending", reason: "no_booking" };
  const people = await exec
    .select({ id: interpreters.id, account: interpreters.name, display: interpreterDisplayName })
    .from(interpreters)
    .where(inArray(interpreters.id, [...bookedIds]));
  const picked = pickByReportName(
    people.map((p) => ({ id: p.id, names: Array.from(new Set([p.account, p.display].filter((n): n is string => Boolean(n)))) })),
    reportName,
  );
  if (picked) return { kind: "booked", interpreterId: picked };
  return { kind: "pending", reason: reportName ? "no_name_match" : "ambiguous_booking" };
}

/** Adds the report to the request unless this exact report is already there. True when it was added. */
export async function appendPendingVerification(exec: DbTx, requestId: string, entry: PendingVerification): Promise<boolean> {
  const rows = (await exec.execute(sql`
    UPDATE requests
    SET data = jsonb_set(
          coalesce(data, '{}'::jsonb),
          '{pendingVerifications}',
          coalesce(data -> 'pendingVerifications', '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb
        ),
        updated_at = now()
    WHERE id = ${requestId}
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(data -> 'pendingVerifications', '[]'::jsonb)) e WHERE e ->> 'id' = ${entry.id}
      )
    RETURNING 1 AS added
  `)) as unknown as unknown[];
  return rows.length === 1;
}

/** Removes one report from the request's pending list. */
export async function removePendingVerification(exec: DbTx, requestId: string, reportId: string): Promise<void> {
  await exec.execute(sql`
    UPDATE requests
    SET data = jsonb_set(
          data,
          '{pendingVerifications}',
          coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(data -> 'pendingVerifications') e WHERE e ->> 'id' <> ${reportId}), '[]'::jsonb)
        ),
        updated_at = now()
    WHERE id = ${requestId} AND data ? 'pendingVerifications'
  `);
}
