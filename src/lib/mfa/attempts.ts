import { and, count, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";

/**
 * Brute-force limit for the Settings actions that take a code (confirming enrolment, and re-confirming a change). SERVER ONLY.
 * Same rule and window as signing in: 5 failures in 15 minutes for one email, counted from the audit log.
 */

export const MFA_FAILURE_ACTIONS = ["mfa_enroll_failed", "mfa_stepup_failed"] as const;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function tooManyMfaAttempts(email: string): Promise<boolean> {
  const [recent] = await db
    .select({ failures: count() })
    .from(auditLogs)
    .where(and(inArray(auditLogs.action, [...MFA_FAILURE_ACTIONS]), eq(auditLogs.userEmail, email), gt(auditLogs.createdAt, new Date(Date.now() - WINDOW_MS))));
  return Number(recent?.failures ?? 0) >= MAX_FAILURES;
}

export const recordMfaFailure = (userId: string, email: string, action: (typeof MFA_FAILURE_ACTIONS)[number]): Promise<void> =>
  writeAuditLog({ userId, userEmail: email, action, details: "invalid code or password" });
