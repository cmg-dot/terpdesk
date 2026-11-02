import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { offers, requestActivity, requests } from "@/db/schema";
import { buildJobRecord, IMPORTED_JOB_TITLE } from "@/lib/jobImport/jobRecord";
import type { JobsOutcome, PlannedJob } from "@/lib/jobImport/types";

/**
 * Writes the planned jobs and their interpreter bookings in ONE transaction: all of it or none of it. SERVER ONLY; the
 * caller has already checked the agency role.
 *
 * - A job is requests row + one accepted `offers` row per assigned interpreter (the app's "job assignment") + a
 *   staff-only activity line saying where it came from. All three are inserted in batches.
 * - A row already imported earlier (same fingerprint) is skipped, so re-running the import adds nothing.
 * - Nothing is sent to anyone: no email, no notification.
 * - With `commit: false` everything runs and is rolled back, so the preview reports exactly what an import would do.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Large batches on purpose: each statement costs a full database round trip, and 1,000 rows x 6 columns is far below the 65,535-parameter limit. */
const CHUNK = 1000;
const chunked = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

class DryRun extends Error {}

const importKeyOf = sql<string>`${requests.data}->>'importKey'`;

async function write(tx: Tx, jobs: readonly PlannedJob[]): Promise<JobsOutcome> {
  const existing = new Set<string>();
  for (const batch of chunked(jobs.map((job) => job.contentHash))) {
    const found = await tx.select({ key: importKeyOf }).from(requests).where(inArray(importKeyOf, batch));
    for (const row of found) existing.add(row.key);
  }
  const fresh = jobs.filter((job) => !existing.has(job.contentHash));
  const records = fresh.map(buildJobRecord);

  for (const batch of chunked(records)) {
    await tx.insert(requests).values(
      batch.map((r) => ({ id: r.requestId, title: IMPORTED_JOB_TITLE, status: r.status, data: r.data, createdAt: r.createdAt })),
    );
  }
  const bookings = records.flatMap((r, i) => r.offers.map((o) => ({ ...o, requestId: r.requestId, expiresAt: new Date(fresh[i].endsAt) })));
  for (const batch of chunked(bookings)) {
    await tx.insert(offers).values(batch.map((o) => ({ id: o.id, requestId: o.requestId, interpreterId: o.interpreterId, status: "accepted", expiresAt: o.expiresAt })));
  }
  for (const batch of chunked(records)) {
    await tx.insert(requestActivity).values(
      batch.map((r) => ({ requestId: r.requestId, audience: "agency" as const, kind: "imported", message: "Imported from the agency's Excel workbook", actorLabel: "Excel import" })),
    );
  }

  return { created: records.length, assignments: bookings.length, alreadyImported: jobs.length - fresh.length };
}

export async function persistJobs(jobs: readonly PlannedJob[], options: { commit: boolean }): Promise<JobsOutcome> {
  const result: { outcome?: JobsOutcome } = {};
  try {
    await db.transaction(async (tx) => {
      result.outcome = await write(tx, jobs);
      if (!options.commit) throw new DryRun();
    });
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  if (!result.outcome) throw new Error("The import produced no result.");
  return result.outcome;
}
