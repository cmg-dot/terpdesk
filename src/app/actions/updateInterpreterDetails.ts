"use server";

import { randomUUID } from "crypto";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { db } from "@/db";
import { agencyInterpreters, interpreterProfiles, interpreters } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { isRegisteredInterpreter } from "@/lib/interpreterAccount";
import { logError } from "@/lib/logError";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";
import { updateInterpreterDetailsSchema } from "@/lib/validation/interpreterDetails";
import type { InterpreterDetailsField } from "@/lib/validation/interpreterDetails";

export type UpdateInterpreterDetailsResult =
  | { success: true; email: string; hasPlaceholderEmail: boolean; certification: string; city: string }
  | { success: false; error: string; fieldErrors?: Partial<Record<InterpreterDetailsField, string>> };

const REFUSED = "We could not save those details. Please try again.";

class EmailTakenError extends Error {}
class ProfileClaimedError extends Error {}

/**
 * Lets agency staff correct an interpreter on their roster: email, certification and city.
 *
 * - Email: only for a Shadow / External profile (no linked login), which is how the ".invalid" placeholders from the bulk
 *   import get replaced. Once the interpreter is a registered user the email is their sign-in identity and only they
 *   control it, so a change is refused (the form doesn't offer it). The write is guarded on user_id IS NULL, so a profile
 *   claimed a moment earlier can never have its email changed. An email already used by another interpreter is refused.
 * - Certification and city: allowed for everyone on the roster. Certification is agency-private (never sent to the
 *   interpreter); city is the interpreter's own profile field and is overwritten as typed.
 * - Never changes anything for an interpreter who is not on this agency's approved roster. The audit log records which
 *   fields changed, never their values.
 */
export async function updateInterpreterDetails(input: {
  interpreterId: string;
  email: string;
  certification: string;
  city: string;
}): Promise<UpdateInterpreterDetailsResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }

  const parsed = updateInterpreterDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<InterpreterDetailsField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as InterpreterDetailsField | "interpreterId" | undefined;
      if (field && field !== "interpreterId" && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const { interpreterId, email, certification, city } = parsed.data;

  try {
    // Only people on this agency's approved roster, never by id alone.
    const [person] = await db
      .select({ id: interpreters.id, email: interpreters.email, userId: interpreters.userId })
      .from(interpreters)
      .innerJoin(agencyInterpreters, eq(agencyInterpreters.interpreterId, interpreters.id))
      .where(and(eq(interpreters.id, interpreterId), eq(agencyInterpreters.agencyId, DEFAULT_AGENCY_ID), eq(agencyInterpreters.status, "approved")))
      .limit(1);
    if (!person) return { success: false, error: "That interpreter isn't on your roster." };

    const registered = isRegisteredInterpreter(person);
    const currentEmail = person.email.toLowerCase();
    const emailChanged = email !== "" && email !== currentEmail;

    if (emailChanged && registered) {
      return {
        success: false,
        error: "This interpreter signs in with their own account, so only they can change their email.",
        fieldErrors: { email: "Only the interpreter can change this." },
      };
    }
    if (email === "" && !registered && !isPlaceholderEmail(currentEmail)) {
      return { success: false, error: "Please fix the highlighted fields.", fieldErrors: { email: "An email address is required." } };
    }

    await ensureAvailabilityTables();
    const changed: string[] = [];

    await db.transaction(async (tx) => {
      if (emailChanged) {
        const [taken] = await tx
          .select({ id: interpreters.id })
          .from(interpreters)
          .where(and(sql`lower(${interpreters.email}) = ${email}`, ne(interpreters.id, interpreterId)))
          .limit(1);
        if (taken) throw new EmailTakenError();
        const updated = await tx
          .update(interpreters)
          .set({ email, updatedAt: new Date() })
          .where(and(eq(interpreters.id, interpreterId), isNull(interpreters.userId)))
          .returning({ id: interpreters.id });
        // Claimed by its owner a moment ago: the email is theirs now.
        if (updated.length === 0) throw new ProfileClaimedError();
        changed.push("email");
      }

      // Older data can hold more than one profile row; the newest is the one everything reads.
      const [profile] = await tx
        .select({ id: interpreterProfiles.id, certification: interpreterProfiles.certification, city: interpreterProfiles.city })
        .from(interpreterProfiles)
        .where(eq(interpreterProfiles.interpreterId, interpreterId))
        .orderBy(desc(interpreterProfiles.updatedAt))
        .limit(1);
      const nextCertification = certification === "" ? null : certification;
      const nextCity = city === "" ? null : city;
      if (profile) {
        if ((profile.certification ?? null) !== nextCertification) changed.push("certification");
        if ((profile.city ?? null) !== nextCity) changed.push("city");
        // Only these two columns change; updated_at is left alone so the profile does not look edited by its owner.
        await tx.update(interpreterProfiles).set({ certification: nextCertification, city: nextCity }).where(eq(interpreterProfiles.id, profile.id));
      } else {
        // A shadow profile nobody has saved yet has no row: create it with defaults.
        if (nextCertification !== null) changed.push("certification");
        if (nextCity !== null) changed.push("city");
        await tx.insert(interpreterProfiles).values({ id: randomUUID(), interpreterId, certification: nextCertification, city: nextCity });
      }
    });

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "interpreter_details_updated",
      details: `interpreterId=${interpreterId}; changed=${changed.length > 0 ? changed.join(",") : "none"}`,
    });
    revalidatePath(`/interpreters/${interpreterId}`);
    revalidatePath("/interpreters");

    const savedEmail = emailChanged ? email : currentEmail;
    const placeholder = isPlaceholderEmail(savedEmail);
    return { success: true, email: placeholder ? "" : savedEmail, hasPlaceholderEmail: placeholder, certification, city };
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { success: false, error: "Please fix the highlighted fields.", fieldErrors: { email: "That email already belongs to another interpreter." } };
    }
    if (err instanceof ProfileClaimedError) {
      return { success: false, error: "This interpreter just connected their own account, so only they can change their email. Reload the page." };
    }
    logError("updateInterpreterDetails", err);
    return { success: false, error: REFUSED };
  }
}
