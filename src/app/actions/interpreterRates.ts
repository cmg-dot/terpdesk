"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { db } from "@/db";
import { agencyInterpreters, interpreterProfiles } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { rateToText, updateInterpreterRatesSchema } from "@/lib/validation/interpreterRates";
import type { InterpreterRatesField, InterpreterRatesInput } from "@/lib/validation/interpreterRates";

export type UpdateInterpreterRatesResult =
  | { success: true; rates: InterpreterRatesInput }
  | { success: false; error: string; fieldErrors?: Partial<Record<InterpreterRatesField, string>> };

const toStored = (value: string): string | null => (value === "" ? null : Number(value).toFixed(2));

/**
 * Sets the State and Non-state hourly rates for an interpreter on this agency's roster. Agency staff only; rates are
 * never part of anything an interpreter receives. Only the two rate columns change: the profile's updated_at is left
 * alone, so the interpreter's profile does not look edited and the newest-row ordering is unaffected.
 */
export async function updateInterpreterRates(input: {
  interpreterId: string;
  stateRate: string;
  nonStateRate: string;
}): Promise<UpdateInterpreterRatesResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const parsed = updateInterpreterRatesSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<InterpreterRatesField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as InterpreterRatesField | "interpreterId" | undefined;
      if (field && field !== "interpreterId" && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const { interpreterId } = parsed.data;
  const stateRate = toStored(parsed.data.stateRate);
  const nonStateRate = toStored(parsed.data.nonStateRate);

  try {
    // A rate can only be set for an interpreter this agency has an approved connection with, never by id alone.
    const [onRoster] = await db
      .select({ id: agencyInterpreters.id })
      .from(agencyInterpreters)
      .where(
        and(
          eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID),
          eq(agencyInterpreters.interpreterId, interpreterId),
          eq(agencyInterpreters.status, "approved"),
        ),
      )
      .limit(1);
    if (!onRoster) return { success: false, error: "That interpreter isn't on your roster." };

    await ensureAvailabilityTables();
    // Older data can hold more than one profile row per interpreter; the newest is the one everything reads.
    const [existing] = await db
      .select({ id: interpreterProfiles.id })
      .from(interpreterProfiles)
      .where(eq(interpreterProfiles.interpreterId, interpreterId))
      .orderBy(desc(interpreterProfiles.updatedAt))
      .limit(1);
    if (existing) {
      await db.update(interpreterProfiles).set({ stateRate, nonStateRate }).where(eq(interpreterProfiles.id, existing.id));
    } else {
      // An interpreter who has never saved a profile has no row yet (shadow profiles): create it with defaults.
      await db.insert(interpreterProfiles).values({ id: randomUUID(), interpreterId, stateRate, nonStateRate });
    }

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "interpreter_rates_updated",
      details: `interpreterId=${interpreterId}; stateRate=${stateRate ?? "none"}; nonStateRate=${nonStateRate ?? "none"}`,
    });
    revalidatePath(`/interpreters/${interpreterId}`);
    return { success: true, rates: { stateRate: rateToText(stateRate), nonStateRate: rateToText(nonStateRate) } };
  } catch (err) {
    logError("updateInterpreterRates", err);
    return { success: false, error: "We could not save the rates. Please try again." };
  }
}
