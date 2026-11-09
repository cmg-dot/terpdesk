"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { authOptions } from "@/lib/auth/options";
import { writeAuditLog } from "@/lib/audit";
import { IDLE_LIMIT_MS } from "@/lib/auth/idle";

/**
 * Records that an agency login was signed out for inactivity (called by the browser just before it signs out). Takes no
 * input: the row is always about the caller's own session, never an id from the request. It reads the session directly
 * instead of through the guards, because by now the session is, by design, past the idle limit and the guards refuse it.
 * Identifiers only: no names, no page, no data. Failures are swallowed, so a timeout always completes. Several open tabs
 * all notice the same timeout, so a second row for the same login within a minute is skipped.
 */
const DUPLICATE_WINDOW_MS = 60 * 1000;

export async function recordIdleSignOut(): Promise<void> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || user.role !== "agency") return;
  try {
    const [recent] = await db
      .select({ rows: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, user.id), eq(auditLogs.action, "session_idle_timeout"), gt(auditLogs.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS))));
    if (Number(recent?.rows ?? 0) > 0) return;
  } catch {
    // Cannot tell: write the row anyway rather than lose the record.
  }
  await writeAuditLog({
    userId: user.id,
    userEmail: user.email ?? null,
    action: "session_idle_timeout",
    details: `signed out after ${Math.round(IDLE_LIMIT_MS / 60000)} minutes of inactivity`,
  });
}
