import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { InsertRequest } from "@/db/schema";

/**
 * Inserts an ODHH request from an inbound email AT MOST ONCE.
 *
 * AWS retries a failed delivery, and the state sometimes sends the same email twice, so the same job could be saved
 * twice (and then offered, hours-logged and billed twice). Before inserting, this looks for an existing request with
 * the same SRN (case-insensitive, any status: a cancelled job's SRN is still that job). Emails with no readable SRN
 * fall back to an identical-content check. The lookup and the insert run in one transaction under an advisory lock on
 * the same key, so two deliveries arriving at the same moment cannot both pass the check.
 *
 * Used by both ODHH email routes (/api/intake and /api/intake/odhh), which share the lock key, so a job that arrives
 * through one route and again through the other is still saved once.
 *
 * SERVER ONLY.
 */

export interface OnceKey {
  /** The ODHH Service Request Number, when the email has a readable one. */
  srn: string | null;
  /** From `contentFingerprint`: used only when there is no SRN. */
  contentHash: string;
}

export interface OnceResult {
  id: string;
  /** True when a request for this email already existed and nothing was inserted. */
  duplicate: boolean;
}

/** SHA-256 of the email text with whitespace collapsed, so a retried delivery of the same email matches. */
export const contentFingerprint = (rawContent: string): string =>
  createHash("sha256").update(rawContent.replace(/\s+/g, " ").trim()).digest("hex");

export async function insertOdhhRequestOnce(values: InsertRequest, key: OnceKey): Promise<OnceResult> {
  const lockKey = key.srn ? `odhh-srn:${key.srn.toLowerCase()}` : `odhh-hash:${key.contentHash}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const match = key.srn
      ? sql`lower(${requests.data} #>> '{intake,odhhSrn}') = ${key.srn.toLowerCase()}`
      : sql`${requests.data} #>> '{source,contentHash}' = ${key.contentHash}`;
    const [existing] = await tx.select({ id: requests.id }).from(requests).where(match).limit(1);
    if (existing) return { id: existing.id, duplicate: true };

    const [row] = await tx.insert(requests).values(values).returning({ id: requests.id });
    return { id: row.id, duplicate: false };
  });
}
