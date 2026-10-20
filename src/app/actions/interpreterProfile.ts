"use server";

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { interpreterProfiles, users } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { interpreterProfileSchema } from "@/lib/validation/interpreterProfile";
import type { InterpreterProfileField, InterpreterProfileInput, MyProfile } from "@/lib/validation/interpreterProfile";

export type GetMyProfileResult = { success: true; profile: MyProfile } | { success: false; error: string };

export type UpdateMyProfileResult =
  | { success: true; profile: MyProfile }
  | { success: false; error: string; fieldErrors?: Partial<Record<InterpreterProfileField, string>> };

const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before editing it.";

/** The profile row for an interpreter. Older data can hold more than one; the newest wins. */
const findProfileRow = async (interpreterId: string) => {
  const [row] = await db
    .select()
    .from(interpreterProfiles)
    .where(eq(interpreterProfiles.interpreterId, interpreterId))
    .orderBy(desc(interpreterProfiles.updatedAt))
    .limit(1);
  return row ?? null;
};

const loadProfile = async (userId: string, interpreterId: string): Promise<MyProfile> => {
  const [account] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const row = await findProfileRow(interpreterId);
  return {
    fullName: account?.name ?? "",
    signInEmail: account?.email ?? "",
    preferredName: row?.preferredName ?? "",
    photoUrl: row?.photoUrl ?? "",
    shortBio: row?.shortBio ?? "",
    city: row?.city ?? "",
    stateOrRegion: row?.stateOrRegion ?? "",
    serviceArea: row?.serviceArea ?? "",
    timeZone: row?.timeZone ?? "America/Los_Angeles",
    takesInPerson: row?.takesInPerson ?? true,
    takesVirtual: row?.takesVirtual ?? true,
    workEmail: row?.workEmail ?? "",
    workPhone: row?.workPhone ?? "",
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
};

/** The signed-in interpreter's own profile. Always scoped to the session; no id is accepted from the browser. */
export async function getMyProfile(): Promise<GetMyProfileResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_LINKED };
  }
  try {
    await ensureAvailabilityTables();
    return { success: true, profile: await loadProfile(session.user.id, interpreterId) };
  } catch (err) {
    logError("getMyProfile", err);
    return { success: false, error: "We could not load your profile. Please refresh the page." };
  }
}

/** Saves the signed-in interpreter's own profile. The sign-in email and account name are never changed here. */
export async function updateMyProfile(input: InterpreterProfileInput): Promise<UpdateMyProfileResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_LINKED };
  }

  const parsed = interpreterProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<InterpreterProfileField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as InterpreterProfileField | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const d = parsed.data;
  // Only validated, picked fields reach the database. Empty strings are stored as "not set".
  const values = {
    preferredName: d.preferredName || null,
    photoUrl: d.photoUrl || null,
    shortBio: d.shortBio || null,
    city: d.city || null,
    stateOrRegion: d.stateOrRegion || null,
    serviceArea: d.serviceArea || null,
    timeZone: d.timeZone,
    takesInPerson: d.takesInPerson,
    takesVirtual: d.takesVirtual,
    workEmail: d.workEmail ? d.workEmail.toLowerCase() : null,
    workPhone: d.workPhone || null,
    updatedAt: new Date(),
  };

  try {
    await ensureAvailabilityTables();
    const existing = await findProfileRow(interpreterId);
    if (existing) {
      await db.update(interpreterProfiles).set(values).where(eq(interpreterProfiles.id, existing.id));
    } else {
      await db.insert(interpreterProfiles).values({ id: randomUUID(), interpreterId, ...values });
    }

    revalidatePath("/profile");
    revalidatePath("/interpreter-calendar");
    return { success: true, profile: await loadProfile(session.user.id, interpreterId) };
  } catch (err) {
    logError("updateMyProfile", err);
    return { success: false, error: "We could not save your profile. Please try again." };
  }
}
