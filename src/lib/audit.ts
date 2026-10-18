import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export interface AuditEntry {
  userId?: string | null;
  userEmail?: string | null;
  /** Short machine name, e.g. "login_failed", "login_success", "timesheet_approved". */
  action: string;
  /** Free text for investigators. Identifiers only: never names, notes or other PHI. */
  details?: string | null;
}

/**
 * Appends one audit row. Audit problems must never break the action being audited (or lock anyone out),
 * so failures are swallowed and logged by error code only.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
      action: entry.action,
      details: entry.details ?? null,
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[audit] could not write "${entry.action}" (code: ${code})`);
  }
}
