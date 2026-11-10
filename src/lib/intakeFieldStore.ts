import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";

/**
 * The one write behind the agency-only billing boxes in Staffing (actions/setBillingFields.ts). Changes ONLY one named key of the
 * job's `intake` (an empty value removes the key): every other key of the job's data is left exactly as it was. The key comes from a
 * fixed list, never from the browser. Takes an optional executor so a test can run it inside a transaction it rolls back.
 * SERVER ONLY.
 */

type Executor = Pick<typeof db, "select" | "update">;

export type IntakeBillingKey = "clientDob" | "billingModifier";

export type IntakeFieldWrite = { ok: true; hadValue: boolean } | { ok: false; reason: "not_found" };

export async function writeIntakeField(requestId: string, key: IntakeBillingKey, value: string, exec: Executor = db): Promise<IntakeFieldWrite> {
  const [existing] = await exec.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!existing) return { ok: false, reason: "not_found" };
  const current = existing.data?.intake?.[key];
  const hadValue = typeof current === "string" && current.trim() !== "";
  const intake = sql`coalesce(${requests.data} -> 'intake', '{}'::jsonb)`;
  const nextIntake = value === "" ? sql`${intake} - ${key}::text` : sql`${intake} || jsonb_build_object(${key}::text, ${value}::text)`;
  await exec
    .update(requests)
    .set({ data: sql<RequestData>`jsonb_set(${requests.data}, '{intake}', ${nextIntake}, true)`, updatedAt: new Date() })
    .where(eq(requests.id, requestId));
  return { ok: true, hadValue };
}
