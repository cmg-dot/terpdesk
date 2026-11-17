"use server";

import { and, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { billingStaff, writeFailed } from "@/lib/billing/actionGuard";
import type { BillingActionResult } from "@/lib/billing/actionGuard";
import { isPlainVoidData, isReturnedData } from "@/lib/voidReasons";
import { cancellationOverrideSchema, kingCountyOverrideSchema } from "@/lib/validation/billing";

/**
 * Staff overrides on one job's billing (Billing > Invoicing):
 *  - a cancelled job: billable / not billable, or back to the 48-business-hour rule ("auto"). Kept in requests.billing_status, the
 *    column the schema has always had for this; a voided or returned job is never changed (its billing is already settled).
 *  - King County: yes / no, or back to the address ("auto"). Kept in requests.data.billing.kingCounty; nothing else in data changes.
 * Agency staff only; audited with ids only.
 */

const CANCELLED = "cancel%";

export async function setCancellationBilling(input: { requestId: string; value: "auto" | "billable" | "not_billable" }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = cancellationOverrideSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose billable, not billable or automatic." };
  const { requestId, value } = parsed.data;
  const billingStatus = value === "auto" ? null : value === "billable" ? "cancelled_billable" : "cancelled_not_billable";
  try {
    const [job] = await db.select({ data: requests.data }).from(requests).where(and(eq(requests.id, requestId), ilike(requests.status, CANCELLED))).limit(1);
    if (!job) return { success: false, error: "Only a cancelled job can be marked billable or not billable." };
    if (isPlainVoidData(job.data) || isReturnedData(job.data)) return { success: false, error: "A voided or returned job is never billed." };
    await db.update(requests).set({ billingStatus }).where(and(eq(requests.id, requestId), ilike(requests.status, CANCELLED)));
  } catch (error) {
    return writeFailed("setCancellationBilling", error);
  }
  await writeAuditLog({ userId: staff.session.user.id, userEmail: staff.session.user.email ?? null, action: "billing_cancellation_override", details: `requestId=${requestId}; value=${value}` });
  revalidatePath("/billing");
  return { success: true };
}

export async function setKingCountyOverride(input: { requestId: string; value: "auto" | "yes" | "no" }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = kingCountyOverrideSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose King County, not King County or automatic." };
  const { requestId, value } = parsed.data;
  const data =
    value === "auto"
      ? sql`${requests.data} #- '{billing,kingCounty}'`
      : sql`jsonb_set(coalesce(${requests.data}, '{}'::jsonb), '{billing}', coalesce(${requests.data} -> 'billing', '{}'::jsonb) || ${JSON.stringify({ kingCounty: value === "yes" })}::jsonb)`;
  try {
    const [row] = await db.update(requests).set({ data }).where(eq(requests.id, requestId)).returning({ id: requests.id });
    if (!row) return { success: false, error: "That job no longer exists." };
  } catch (error) {
    return writeFailed("setKingCountyOverride", error);
  }
  await writeAuditLog({ userId: staff.session.user.id, userEmail: staff.session.user.email ?? null, action: "billing_king_county_override", details: `requestId=${requestId}; value=${value}` });
  revalidatePath("/billing");
  return { success: true };
}
