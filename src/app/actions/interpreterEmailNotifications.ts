"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

export type EmailNotificationsResult = { success: true; enabled: boolean } | { success: false; error: string };

const inputSchema = z.object({ interpreterId: z.string().uuid(), enabled: z.boolean() });

/**
 * Agency switch: whether this interpreter receives operational email (offers, booking confirmations, job updates, timesheet
 * links). Off by default; while off they still get everything in the app. Enforced by src/lib/emailGate.ts.
 * Only changes a row on this agency's approved roster. The audit log records the new setting, never an address.
 */
export async function setInterpreterEmailNotifications(input: z.input<typeof inputSchema>): Promise<EmailNotificationsResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { interpreterId, enabled } = parsed.data;

  try {
    await ensureAgencyInterpreterColumns();
    const [row] = await db
      .update(agencyInterpreters)
      .set({ emailNotificationsEnabled: enabled, updatedAt: new Date() })
      .where(
        and(
          eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID),
          eq(agencyInterpreters.interpreterId, interpreterId),
          eq(agencyInterpreters.status, "approved"),
        ),
      )
      .returning({ enabled: agencyInterpreters.emailNotificationsEnabled });
    if (!row) return { success: false, error: "This interpreter is not on your roster." };

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: enabled ? "interpreter_email_notifications_on" : "interpreter_email_notifications_off",
      details: `interpreterId=${interpreterId}`,
    });
    revalidatePath(`/interpreters/${interpreterId}`);
    revalidatePath("/interpreters");
    return { success: true, enabled: row.enabled };
  } catch (err) {
    logError("setInterpreterEmailNotifications", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}
