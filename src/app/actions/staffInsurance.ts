"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { INSURANCE_LABEL, staffCommercialAutoSchema } from "@/lib/insurance";
import type { InsurancePolicy, StaffCommercialAutoField, StaffCommercialAutoInput } from "@/lib/insurance";
import { loadInsurance } from "@/lib/insuranceStore";
import { logError } from "@/lib/logError";
import { activeCommercialAuto, staffForLoginlessInterpreter } from "@/lib/staffInsuranceAccess";

/**
 * Agency staff record (or update, or remove) the commercial auto policy of an interpreter who has no terpDESK login, so the +$10 on
 * in-person State and Apple Health jobs reaches them once the expiration date is on file. The same credential record an interpreter's
 * own policy uses (one active per kind), so billing, Hours review and the profile read it the same way. Audited with ids only.
 */

export type StaffCommercialAutoResult =
  | { success: true; policy: InsurancePolicy | null }
  | { success: false; error: string; fieldErrors?: Partial<Record<StaffCommercialAutoField, string>> };

const refresh = (interpreterId: string) => {
  for (const path of [`/interpreters/${interpreterId}`, "/billing", "/hours-review"]) revalidatePath(path);
};

export async function saveStaffCommercialAuto(input: StaffCommercialAutoInput): Promise<StaffCommercialAutoResult> {
  const parsed = staffCommercialAutoSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<StaffCommercialAutoField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field !== "interpreterId" && !fieldErrors[field as StaffCommercialAutoField]) fieldErrors[field as StaffCommercialAutoField] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const access = await staffForLoginlessInterpreter(parsed.data.interpreterId);
  if (!access.ok) return { success: false, error: access.error };
  const { interpreterId } = access;
  const { expirationDate, coverageLimits, insurer } = parsed.data;
  const values = { issuedBy: insurer || null, coverageLimits: coverageLimits || null, expirationDate, updatedAt: new Date() };

  try {
    await ensureAvailabilityTables();
    const current = await activeCommercialAuto(interpreterId);
    if (current) await db.update(credentials).set(values).where(eq(credentials.id, current.id));
    else await db.insert(credentials).values({ interpreterId, name: INSURANCE_LABEL.commercial_auto, type: "Insurance", insuranceKind: "commercial_auto", ...values });
    await writeAuditLog({ userId: access.session.user.id, userEmail: access.session.user.email ?? null, action: "insurance_saved_by_staff", details: `kind=commercial_auto; interpreterId=${interpreterId}` });
    refresh(interpreterId);
    return { success: true, policy: (await loadInsurance(interpreterId)).commercial_auto };
  } catch (err) {
    logError("saveStaffCommercialAuto", err);
    return { success: false, error: "We could not save this policy. Please try again." };
  }
}

/** Takes the policy off the profile (archived, with its document hidden), as the interpreter's own Remove does. */
export async function removeStaffCommercialAuto(input: { interpreterId: string }): Promise<StaffCommercialAutoResult> {
  const parsed = z.object({ interpreterId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const access = await staffForLoginlessInterpreter(parsed.data.interpreterId);
  if (!access.ok) return { success: false, error: access.error };
  try {
    const current = await activeCommercialAuto(access.interpreterId);
    if (current) await db.update(credentials).set({ isArchived: true, updatedAt: new Date() }).where(eq(credentials.id, current.id));
    await writeAuditLog({ userId: access.session.user.id, userEmail: access.session.user.email ?? null, action: "insurance_removed_by_staff", details: `kind=commercial_auto; interpreterId=${access.interpreterId}` });
    refresh(access.interpreterId);
    return { success: true, policy: null };
  } catch (err) {
    logError("removeStaffCommercialAuto", err);
    return { success: false, error: "We could not remove this policy. Please try again." };
  }
}
