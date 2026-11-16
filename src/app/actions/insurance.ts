"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { credentials, interpreterProfiles } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { INSURANCE_KINDS, INSURANCE_LABEL, insuranceSchema, insuranceWarnings } from "@/lib/insurance";
import type { InsuranceField, InsuranceInput, InsuranceWarning, MyInsurance } from "@/lib/insurance";
import { interpreterZone, loadInsurance } from "@/lib/insuranceStore";
import { logError } from "@/lib/logError";

export type SaveInsuranceResult =
  | { success: true; insurance: MyInsurance }
  | { success: false; error: string; fieldErrors?: Partial<Record<InsuranceField, string>> };

const me = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

/** The signed-in interpreter's Liability and Commercial Auto policies. */
export async function getMyInsurance(): Promise<MyInsurance> {
  const { interpreterId } = await requireInterpreter();
  await ensureAvailabilityTables();
  return loadInsurance(interpreterId);
}

/**
 * Adds or updates one of the two policies (one active of each kind). Saving the liability policy also keeps the profile's liability
 * expiration date in step, which the agency's roster and older screens read. The policy number and insurer are never logged.
 */
export async function saveInsurance(input: InsuranceInput): Promise<SaveInsuranceResult> {
  const session = await me();
  if (!session) return { success: false, error: "Connect your interpreter profile before adding insurance." };
  const parsed = insuranceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<InsuranceField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && field !== "kind" && !fieldErrors[field as InsuranceField]) fieldErrors[field as InsuranceField] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const { kind, insurer, policyNumber, coverageLimits, expirationDate } = parsed.data;
  const { interpreterId } = session;
  const values = { issuedBy: insurer, credentialNumber: policyNumber || null, coverageLimits: coverageLimits || null, expirationDate, updatedAt: new Date() };

  try {
    await ensureAvailabilityTables();
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: credentials.id })
        .from(credentials)
        .where(and(eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false), eq(credentials.insuranceKind, kind)))
        .limit(1);
      if (current) await tx.update(credentials).set(values).where(eq(credentials.id, current.id));
      else await tx.insert(credentials).values({ interpreterId, name: INSURANCE_LABEL[kind], type: "Insurance", insuranceKind: kind, ...values });
      if (kind === "liability") {
        await tx.update(interpreterProfiles).set({ liabilityInsuranceExpiration: expirationDate, updatedAt: new Date() }).where(eq(interpreterProfiles.interpreterId, interpreterId));
      }
    });
    await writeAuditLog({ userId: session.session.user.id, userEmail: session.session.user.email ?? null, action: "insurance_saved", details: `kind=${kind}` });
    revalidatePath("/profile");
    return { success: true, insurance: await loadInsurance(interpreterId) };
  } catch (err) {
    logError("saveInsurance", err);
    return { success: false, error: "We could not save this policy. Please try again." };
  }
}

/** Removes a policy from the profile (archived, with its files hidden from the agency). */
export async function removeInsurance(kindInput: string): Promise<SaveInsuranceResult> {
  const session = await me();
  if (!session) return { success: false, error: "Connect your interpreter profile first." };
  const kind = z.enum(INSURANCE_KINDS).safeParse(kindInput);
  if (!kind.success) return { success: false, error: "Invalid request." };
  try {
    await db
      .update(credentials)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(credentials.interpreterId, session.interpreterId), eq(credentials.isArchived, false), eq(credentials.insuranceKind, kind.data)));
    await writeAuditLog({ userId: session.session.user.id, userEmail: session.session.user.email ?? null, action: "insurance_removed", details: `kind=${kind.data}` });
    revalidatePath("/profile");
    return { success: true, insurance: await loadInsurance(session.interpreterId) };
  } catch (err) {
    logError("removeInsurance", err);
    return { success: false, error: "We could not remove this policy. Please try again." };
  }
}

/**
 * For the dashboard banner: the signed-in interpreter's policies that are expired or expire within 30 days. The liability date is
 * the policy's, else the one on the profile (from before the dedicated section). Empty for anyone else or on error.
 */
export async function getMyInsuranceWarnings(): Promise<InsuranceWarning[]> {
  const session = await me();
  if (!session) return [];
  try {
    const [insurance, zone, [profile]] = await Promise.all([
      loadInsurance(session.interpreterId),
      interpreterZone(session.interpreterId),
      db.select({ liability: interpreterProfiles.liabilityInsuranceExpiration }).from(interpreterProfiles).where(eq(interpreterProfiles.interpreterId, session.interpreterId)).limit(1),
    ]);
    const liabilityDate = insurance.liability?.expirationDate || profile?.liability || "";
    return insuranceWarnings(
      [
        ...(liabilityDate ? [{ kind: "liability" as const, expirationDate: liabilityDate }] : []),
        ...(insurance.commercial_auto ? [{ kind: "commercial_auto" as const, expirationDate: insurance.commercial_auto.expirationDate }] : []),
      ],
      zone,
    );
  } catch (err) {
    logError("getMyInsuranceWarnings", err);
    return [];
  }
}
