"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { writeIntakeField } from "@/lib/intakeFieldStore";
import type { IntakeBillingKey } from "@/lib/intakeFieldStore";
import { logError } from "@/lib/logError";
import { logActivity } from "@/lib/requestActivity";
import { DOB_FORMAT_MESSAGE, parseDob, setBillingModifierSchema, setClientDobSchema } from "@/lib/validation/billingFields";
import type { BillingModifier } from "@/lib/validation/billingFields";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type SetClientDobResult = { success: true; clientDob: string } | { success: false; error: string };
export type SetBillingModifierResult = { success: true; modifier: "" | BillingModifier } | { success: false; error: string };

type Who = { id?: string; email?: string | null };

/**
 * The shared write for both boxes. AGENCY ONLY, in both directions: only agency staff can write these, and the values are never sent
 * to interpreters (their views are built from an allowlist that does not include them) or put in an email, a link or a notification.
 * Only that one key changes. The VALUE is never written anywhere but the job itself: the audit row and the activity line record only
 * that something was added, changed or cleared.
 */
async function save(requestId: string, key: IntakeBillingKey, value: string, who: Who, labels: { audit: string; activityKind: string; activityNoun: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  let hadValue = false;
  try {
    const written = await writeIntakeField(requestId, key, value);
    if (!written.ok) return { ok: false, error: "This request no longer exists." };
    hadValue = written.hadValue;
  } catch (err) {
    logError(`set ${key}`, err);
    return { ok: false, error: "We could not save that. Please try again." };
  }
  const what = value === "" ? "cleared" : hadValue ? "changed" : "added";
  await writeAuditLog({ userId: who.id ?? null, userEmail: who.email ?? null, action: labels.audit, details: `requestId=${requestId}; ${what}` });
  await logActivity({ requestId, kind: labels.activityKind, audience: "agency", message: `${labels.activityNoun} ${what}`, actorLabel: "Agency staff" });
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

/** Saves the client's date of birth (intake.clientDob, stored as yyyy-MM-dd) for billing. Agency only. */
export async function setClientDob(input: unknown): Promise<SetClientDobResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = setClientDobSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: DOB_FORMAT_MESSAGE };
  const stored = parseDob(parsed.data.clientDob);
  if (stored === null) return { success: false, error: DOB_FORMAT_MESSAGE };
  const done = await save(parsed.data.requestId, "clientDob", stored, session.user, { audit: "client_dob_saved", activityKind: "client_dob", activityNoun: "Client date of birth" });
  return done.ok ? { success: true, clientDob: stored } : { success: false, error: done.error };
}

/** Saves the billing modifier (intake.billingModifier): "U3" (medical) or "U3 U9" (mental health); empty (or null) clears it. Agency only. */
export async function setBillingModifier(input: unknown): Promise<SetBillingModifierResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = setBillingModifierSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose U3 (Medical), U3 U9 (Mental Health) or none." };
  const done = await save(parsed.data.requestId, "billingModifier", parsed.data.modifier, session.user, { audit: "billing_modifier_saved", activityKind: "billing_modifier", activityNoun: "Billing modifier" });
  return done.ok ? { success: true, modifier: parsed.data.modifier } : { success: false, error: done.error };
}
