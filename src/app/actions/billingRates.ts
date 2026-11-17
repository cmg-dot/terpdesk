"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agencyInterpreterBilling } from "@/db/billingSchema";
import { agencyInterpreters, clients } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { billingStaff, fieldErrorsOf, writeFailed } from "@/lib/billing/actionGuard";
import type { BillingActionResult } from "@/lib/billing/actionGuard";
import { clientBillingSchema, eveningRateSchema } from "@/lib/validation/billing";
import type { ClientBillingInput } from "@/lib/validation/billing";

/**
 * Billing > Rates & rules: an organization's own Non-state terms (clients.data.billing) and an interpreter's evening travel rate.
 * The State, King County and Non-state hourly rates keep their own action (actions/interpreterRates.ts). Agency staff only.
 */

/** Sets (or clears) an organization's rate and rounding; only the `billing` key of its data changes. */
export async function setClientBilling(input: ClientBillingInput): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = clientBillingSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const { clientId, rate, roundingMinutes } = parsed.data;
  const billing = { rate: rate === "" ? null : Number(Number(rate).toFixed(2)), roundingMinutes: roundingMinutes === "" ? null : Number(roundingMinutes) };
  try {
    const [row] = await db
      .update(clients)
      .set({ data: sql`jsonb_set(coalesce(${clients.data}, '{}'::jsonb), '{billing}', ${JSON.stringify(billing)}::jsonb)` })
      .where(eq(clients.id, clientId))
      .returning({ id: clients.id });
    if (!row) return { success: false, error: "That organization no longer exists." };
  } catch (error) {
    return writeFailed("setClientBilling", error);
  }
  await writeAuditLog({
    userId: staff.session.user.id,
    userEmail: staff.session.user.email ?? null,
    action: "billing_client_terms_updated",
    details: `clientId=${clientId}; rate=${billing.rate ?? "default"}; roundingMinutes=${billing.roundingMinutes ?? "default"}`,
  });
  revalidatePath("/billing");
  return { success: true };
}

/** Sets (or clears) the evening travel rate of an interpreter on this agency's roster. */
export async function setEveningRate(input: { interpreterId: string; eveningRate: string }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = eveningRateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const { interpreterId, eveningRate } = parsed.data;
  const stored = eveningRate === "" ? null : Number(eveningRate).toFixed(2);
  try {
    // Never by id alone: only an interpreter this agency has an approved connection with.
    const [onRoster] = await db
      .select({ id: agencyInterpreters.id })
      .from(agencyInterpreters)
      .where(and(eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID), eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.status, "approved")))
      .limit(1);
    if (!onRoster) return { success: false, error: "That interpreter isn't on your roster." };
    await db
      .insert(agencyInterpreterBilling)
      .values({ agencyId: DEFAULT_AGENCY_ID, interpreterId, eveningRate: stored, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [agencyInterpreterBilling.agencyId, agencyInterpreterBilling.interpreterId], set: { eveningRate: stored, updatedAt: new Date() } });
  } catch (error) {
    return writeFailed("setEveningRate", error);
  }
  await writeAuditLog({
    userId: staff.session.user.id,
    userEmail: staff.session.user.email ?? null,
    action: "billing_evening_rate_updated",
    details: `interpreterId=${interpreterId}; eveningRate=${stored ?? "none"}`,
  });
  revalidatePath("/billing");
  return { success: true };
}
