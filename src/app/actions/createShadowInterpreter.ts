"use server";

import { requireRole } from "@/lib/auth/guards";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agencyInterpreters, interpreters, type SelectInterpreter } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { ilike } from "drizzle-orm";

export interface CreateShadowInterpreterData {
  email: string;
  name?: string;
  phone?: string;
}

/**
 * Creates or retrieves a shadow interpreter profile by email.
 * If an interpreter with the given email already exists, returns the existing record.
 * Otherwise, generates a UUID and inserts a new interpreter row into `public.interpreters`.
 */
export async function createShadowInterpreter(
  data: CreateShadowInterpreterData
): Promise<SelectInterpreter> {
  await requireRole("agency");
  if (!data || !data.email || typeof data.email !== "string" || !data.email.trim()) {
    throw new Error("A valid email is required to create a shadow interpreter profile.");
  }

  const normalizedEmail = data.email.trim().toLowerCase();

  // 1. Check if an interpreter with the provided email already exists
  const [existingInterpreter] = await db
    .select()
    .from(interpreters)
    .where(ilike(interpreters.email, normalizedEmail))
    .limit(1);

  if (existingInterpreter) {
    return existingInterpreter;
  }

  // 2. Derive a valid name if not provided
  const trimmedName = data.name?.trim();
  const usernamePart = normalizedEmail.split("@")[0]?.trim();
  const fallbackName = usernamePart
    ? usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1)
    : "Interpreter";
  const name = trimmedName && trimmedName.length > 0 ? trimmedName : fallbackName;

  const phone = data.phone?.trim() && data.phone.trim().length > 0 ? data.phone.trim() : null;
  const now = new Date();
  const id = randomUUID();

  // 3. Insert new interpreter record parameter-safely using Drizzle ORM
  try {
    const [newInterpreter] = await db
      .insert(interpreters)
      .values({
        id,
        name,
        email: normalizedEmail,
        phone,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // The creating agency has this person on its roster. Registered people join by request instead, so only
    // shadow profiles (which cannot have a login yet) get an automatic row.
    await ensureAgencyInterpreterColumns();
    await db
      .insert(agencyInterpreters)
      .values({ agencyId: DEFAULT_AGENCY_ID, interpreterId: newInterpreter.id, status: "approved" })
      .onConflictDoNothing();

    try {
      revalidatePath("/interpreters");
      revalidatePath("/requests");
    } catch {
      // Revalidation may fail if called outside request lifecycle; ignore safely
    }

    return newInterpreter;
  } catch (error) {
    // Handle concurrent inserts gracefully
    const [concurrentRecord] = await db
      .select()
      .from(interpreters)
      .where(ilike(interpreters.email, normalizedEmail))
      .limit(1);

    if (concurrentRecord) {
      return concurrentRecord;
    }

    throw error;
  }
}

export { addExternalInterpreter } from "./addExternalInterpreter";
export type { AddExternalInterpreterInput, AddExternalInterpreterResponse } from "./addExternalInterpreter";
