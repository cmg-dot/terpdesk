"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { agencyInterpreters, interpreters } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

export type RosterActionResult = { success: true; message: string } | { success: false; error: string };

const idSchema = z.string().uuid();
const activeSchema = z.object({ interpreterId: idSchema, active: z.boolean() });

const DENIED: RosterActionResult = { success: false, error: "You don't have permission to do this." };
const INVALID: RosterActionResult = { success: false, error: "Invalid request." };
const NOT_ON_ROSTER: RosterActionResult = { success: false, error: "This interpreter is not on your roster." };
const FAILED: RosterActionResult = { success: false, error: "Something went wrong. Please try again." };

const onThisRoster = (interpreterId: string) =>
  and(
    eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID),
    eq(agencyInterpreters.interpreterId, interpreterId),
    eq(agencyInterpreters.status, "approved"),
  );

const refresh = () => {
  revalidatePath("/interpreters");
  revalidatePath("/requests");
};

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** Archive (inactive) or reactivate an interpreter for this agency only. Their history and connection are kept. */
export async function setInterpreterActive(input: z.input<typeof activeSchema>): Promise<RosterActionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return DENIED;
  }
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { interpreterId, active } = parsed.data;

  try {
    const [row] = await db
      .update(agencyInterpreters)
      .set({ isActive: active, updatedAt: new Date() })
      .where(onThisRoster(interpreterId))
      .returning({ id: agencyInterpreters.id });
    if (!row) return NOT_ON_ROSTER;

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: active ? "roster_interpreter_reactivated" : "roster_interpreter_deactivated",
      details: `interpreterId=${interpreterId}`,
    });
    refresh();
    return {
      success: true,
      message: active ? "Interpreter reactivated." : "Interpreter archived. They won't receive new dispatches.",
    };
  } catch (err) {
    logError("setInterpreterActive", err);
    return FAILED;
  }
}

/** Revoke this agency's connection. The interpreter's global account and other agencies' connections are untouched. */
export async function removeFromAgency(interpreterIdInput: string): Promise<RosterActionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return DENIED;
  }
  const parsed = idSchema.safeParse(interpreterIdInput);
  if (!parsed.success) return INVALID;

  try {
    const [row] = await db
      .update(agencyInterpreters)
      .set({ status: "revoked", isActive: false, updatedAt: new Date() })
      .where(onThisRoster(parsed.data))
      .returning({ id: agencyInterpreters.id });
    if (!row) return NOT_ON_ROSTER;

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "roster_interpreter_removed",
      details: `interpreterId=${parsed.data}`,
    });
    refresh();
    return { success: true, message: "Interpreter removed from your agency." };
  } catch (err) {
    logError("removeFromAgency", err);
    return FAILED;
  }
}

/**
 * Hard-delete a shadow profile that never registered (no login) and is on no other agency's roster.
 * If past requests or offers still reference it, the database refuses and the profile is revoked instead,
 * so history is never lost. Registered accounts can never be deleted here.
 */
export async function deleteShadowFromRoster(interpreterIdInput: string): Promise<RosterActionResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return DENIED;
  }
  const parsed = idSchema.safeParse(interpreterIdInput);
  if (!parsed.success) return INVALID;
  const interpreterId = parsed.data;
  const thisAgencyRow = and(
    eq(agencyInterpreters.interpreterId, interpreterId),
    eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID),
  );

  try {
    const [target] = await db
      .select({ userId: interpreters.userId })
      .from(interpreters)
      .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
      .where(and(eq(interpreters.id, interpreterId), eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID)))
      .limit(1);
    if (!target) return NOT_ON_ROSTER;
    if (target.userId) {
      return { success: false, error: "Registered interpreters can't be deleted. Remove them from your agency instead." };
    }

    const otherAgency = await db
      .select({ id: agencyInterpreters.id })
      .from(agencyInterpreters)
      .where(and(eq(agencyInterpreters.interpreterId, interpreterId), ne(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID)))
      .limit(1);

    let message = "Interpreter deleted from your roster.";
    try {
      await db.transaction(async (tx) => {
        await tx.delete(agencyInterpreters).where(thisAgencyRow);
        if (otherAgency.length === 0) await tx.delete(interpreters).where(eq(interpreters.id, interpreterId));
      });
    } catch (err) {
      if (pgCode(err) !== "23503") throw err;
      await db
        .update(agencyInterpreters)
        .set({ status: "revoked", isActive: false, updatedAt: new Date() })
        .where(thisAgencyRow);
      message = "This interpreter has job history, so they were removed from your roster and the history was kept.";
    }

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "roster_shadow_deleted",
      details: `interpreterId=${interpreterId}`,
    });
    refresh();
    return { success: true, message };
  } catch (err) {
    logError("deleteShadowFromRoster", err);
    return FAILED;
  }
}
