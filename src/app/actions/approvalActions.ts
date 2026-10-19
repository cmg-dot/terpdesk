"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

export interface PendingInterpreter {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
}

const updateSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export type UpdateInterpreterStatusResult = { success: true } | { success: false; error: string };

/** Interpreter registrations waiting for agency approval, oldest first. Agency staff only. */
export async function getPendingInterpreters(): Promise<PendingInterpreter[]> {
  await requireRole("agency");

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.role, "interpreter"), eq(users.accountStatus, "pending")))
    .orderBy(asc(users.createdAt));

  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, registeredAt: r.createdAt.toISOString() }));
}

/** Approve or reject a registration. Only interpreter accounts can be changed here, never agency staff. */
export async function updateInterpreterStatus(input: z.input<typeof updateSchema>): Promise<UpdateInterpreterStatusResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: "You don't have permission to do this." };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { userId, status } = parsed.data;

  try {
    const [updated] = await db
      .update(users)
      .set({ accountStatus: status, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.role, "interpreter")))
      .returning({ email: users.email });
    if (!updated) return { success: false, error: "Interpreter account not found." };

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: status === "approved" ? "interpreter_approved" : "interpreter_rejected",
      details: `targetUserId=${userId}; targetEmail=${updated.email}`,
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logError("updateInterpreterStatus", err);
    return { success: false, error: "Could not update this registration. Please try again." };
  }
}
