import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";

/**
 * The one write behind the "Prior authorization #" box (actions/setPriorAuth.ts). SERVER ONLY. Changes ONLY `intake.priorAuthNumber`
 * (an empty value removes the key): every other key of the job's data is left exactly as it was. Takes an optional executor so a
 * test can run it inside a transaction it rolls back.
 */

type Executor = Pick<typeof db, "select" | "update">;

/** `previous` is the number saved before (empty when there was none), so a save that changes nothing can be told apart. */
export type PriorAuthWrite = { ok: true; hadValue: boolean; previous: string } | { ok: false; reason: "not_found" };

export async function writePriorAuth(requestId: string, priorAuth: string, exec: Executor = db): Promise<PriorAuthWrite> {
  const [existing] = await exec.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!existing) return { ok: false, reason: "not_found" };
  const stored = existing.data?.intake?.priorAuthNumber;
  const previous = typeof stored === "string" ? stored.trim() : "";
  const hadValue = previous !== "";
  const intake = sql`coalesce(${requests.data} -> 'intake', '{}'::jsonb)`;
  const nextIntake = priorAuth === "" ? sql`${intake} - 'priorAuthNumber'` : sql`${intake} || jsonb_build_object('priorAuthNumber', ${priorAuth}::text)`;
  await exec
    .update(requests)
    .set({ data: sql<RequestData>`jsonb_set(${requests.data}, '{intake}', ${nextIntake}, true)`, updatedAt: new Date() })
    .where(eq(requests.id, requestId));
  return { ok: true, hadValue, previous };
}
