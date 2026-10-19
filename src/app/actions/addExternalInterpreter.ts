"use server";

import { requireRole } from "@/lib/auth/guards";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agencyInterpreters, interpreters, type SelectInterpreter } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ilike } from "drizzle-orm";

export interface AddExternalInterpreterInput {
  name: string;
  email: string;
  phone?: string;
}

export interface AddExternalInterpreterResponse {
  success: boolean;
  interpreter?: SelectInterpreter;
  error?: string;
}

/**
 * Server Action to add an external/shadow interpreter profile directly to the PostgreSQL database.
 * External interpreters do not require NextAuth login credentials and can receive AWS SES email dispatch offers.
 */
export async function addExternalInterpreter(
  input: AddExternalInterpreterInput
): Promise<AddExternalInterpreterResponse> {
  await requireRole("agency");
  if (!input || !input.name || typeof input.name !== "string" || !input.name.trim()) {
    return {
      success: false,
      error: "Interpreter name is required.",
    };
  }

  if (!input.email || typeof input.email !== "string" || !input.email.trim()) {
    return {
      success: false,
      error: "A valid email address is required.",
    };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return {
      success: false,
      error: "Please provide a valid email address.",
    };
  }

  const trimmedName = input.name.trim();
  const trimmedPhone = input.phone && typeof input.phone === "string" && input.phone.trim().length > 0
    ? input.phone.trim()
    : null;

  try {
    // Check if an interpreter with this email already exists
    const [existing] = await db
      .select()
      .from(interpreters)
      .where(ilike(interpreters.email, normalizedEmail))
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: `An interpreter with email "${normalizedEmail}" is already on the roster (${existing.name}).`,
      };
    }

    const now = new Date();
    const id = randomUUID();

    const [newInterpreter] = await db
      .insert(interpreters)
      .values({
        id,
        name: trimmedName,
        email: normalizedEmail,
        phone: trimmedPhone,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // The creating agency has this person on its roster. Registered people join by request instead, so only
    // shadow profiles (which cannot have a login yet) get an automatic row.
    await db
      .insert(agencyInterpreters)
      .values({ agencyId: DEFAULT_AGENCY_ID, interpreterId: newInterpreter.id, status: "approved" })
      .onConflictDoNothing();

    // Revalidate paths so the roster and dispatch dropdowns update immediately
    try {
      revalidatePath("/interpreters");
      revalidatePath("/requests");
    } catch (e) {
      // Revalidation may fail if invoked outside request lifecycle; ignore safely
    }

    return {
      success: true,
      interpreter: newInterpreter,
    };
  } catch (err: any) {
    console.error("[addExternalInterpreter] Error inserting interpreter:", err);
    return {
      success: false,
      error: err?.message || "Failed to add external interpreter to the database.",
    };
  }
}
