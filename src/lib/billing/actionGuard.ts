import type { Session } from "next-auth";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { isMissingTable } from "@/lib/billing/store";
import { logError } from "@/lib/logError";

/** What every billing action answers. `fieldErrors` names the form fields to mark. */
export type BillingActionResult = { success: true } | { success: false; error: string; fieldErrors?: Record<string, string> };

export const NOT_SET_UP = "Billing is not set up on this database yet.";

/** Agency staff only, and only where billing is switched on. SERVER ONLY. */
export async function billingStaff(): Promise<{ ok: true; session: Session } | { ok: false; result: BillingActionResult }> {
  if (!BILLING_ENABLED) return { ok: false, result: { success: false, error: "Billing is not switched on for this workspace." } };
  try {
    return { ok: true, session: await requireRole("agency") };
  } catch {
    return { ok: false, result: { success: false, error: NOT_ALLOWED_MESSAGE } };
  }
}

/** The first message per field of a failed Zod check. */
export function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** A failed write, logged without its data. */
export function writeFailed(where: string, error: unknown): BillingActionResult {
  if (isMissingTable(error)) return { success: false, error: NOT_SET_UP };
  logError(where, error);
  return { success: false, error: "We could not save that. Please try again." };
}
