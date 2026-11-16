"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { IS_DEMO_MODE } from "@/lib/demoMode";
import { logError } from "@/lib/logError";
import { HONEYPOT_FIELD, buildPublicRequest, parsePublicIntake } from "@/lib/publicIntake";
import type { FieldProblem } from "@/lib/publicIntake";
import { announcePublicRequest, insertPublicRequest } from "@/lib/publicIntakeSave";
import { formatReference } from "@/utils/statusEngine";

/**
 * The demo deployment's public booking page (/book) -> a new DRAFT request, through exactly the checks and save the public intake API
 * uses (lib/publicIntake.ts, lib/publicIntakeSave.ts). Refused outright outside demo mode, so production never takes a submission here.
 *
 * Unauthenticated by design, so: a hidden field bots fill in (answered as if saved, nothing written), and a cap on submissions across the
 * whole site per 10 minutes. HIPAA: nothing submitted is logged; the audit line holds the request id only.
 */

const ACTION = "demo_public_request";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;

export type DemoPublicRequestResult =
  | { success: true; reference: string }
  | { success: false; error: string; fields?: FieldProblem[] };

export async function submitDemoPublicRequest(input: Record<string, string>): Promise<DemoPublicRequestResult> {
  if (!IS_DEMO_MODE) return { success: false, error: "This form is not available." };
  // A server action can be called with anything, whatever the type says.
  if (!input || typeof input !== "object" || Array.isArray(input)) return { success: false, error: "Some fields are missing or not valid." };
  try {
    const { [HONEYPOT_FIELD]: trap, ...fields } = input;
    if (trap) return { success: true, reference: "" };

    const [recent] = await db.select({ n: count() }).from(auditLogs).where(and(eq(auditLogs.action, ACTION), gt(auditLogs.createdAt, new Date(Date.now() - WINDOW_MS))));
    if (Number(recent?.n ?? 0) >= MAX_PER_WINDOW) return { success: false, error: "Too many requests right now. Please try again in a few minutes." };

    const parsed = parsePublicIntake(fields);
    if (!parsed.ok) return { success: false, error: "Some fields are missing or not valid.", fields: parsed.fields };

    const draft = buildPublicRequest(parsed.data);
    const saved = await insertPublicRequest(draft, parsed.data.submissionId);
    if (!saved.duplicate) {
      await announcePublicRequest(saved.id, draft, "Website request form");
      await writeAuditLog({ action: ACTION, details: `id=${saved.id}` });
    }
    return { success: true, reference: formatReference(saved.id) };
  } catch (error) {
    logError("Demo public request", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
