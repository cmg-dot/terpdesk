"use server";

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { interpreterProfiles, users } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { deletePhotoFile } from "@/lib/profilePhoto";
import { announceWebsiteReReview, sendApprovedWebsiteProfilesBackToReview } from "@/lib/websiteReview";
import { publicFieldsChanged } from "@/lib/websiteProfile";
import { interpreterProfileSchema } from "@/lib/validation/interpreterProfile";
import type { InterpreterProfileField, InterpreterProfileInput, MyProfile } from "@/lib/validation/interpreterProfile";

export type GetMyProfileResult = { success: true; profile: MyProfile } | { success: false; error: string };

export type UpdateMyProfileResult =
  | {
      success: true;
      profile: MyProfile;
      /** True when the edit sent an approved agency website profile back to review. */
      websiteReReview: boolean;
    }
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
    contactVisibility: row?.contactVisibility ?? "private",
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
  let accountName = session.user.name ?? "";
  try {
    // The form pre-fills the preferred name with the account name. Storing that as a preference would freeze it,
    // so a name equal to the account name is saved as "not set" and keeps following the account.
    const [account] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1);
    if (account) {
      accountName = account.name;
      if (d.preferredName.toLowerCase() === account.name.trim().toLowerCase()) d.preferredName = "";
    }
  } catch (err) {
    logError("updateMyProfile.accountName", err);
  }

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
    contactVisibility: d.contactVisibility,
    updatedAt: new Date(),
  };

  try {
    await ensureAvailabilityTables();
    await ensureAgencyInterpreterColumns();
    const existing = await findProfileRow(interpreterId);

    // A photo can only be set through the upload flow (saveProfilePhoto), never by a value sent from the browser.
    // Here it can only be kept or removed, so nobody can point their profile at someone else's file.
    const removingPhoto = d.photoUrl === "";
    values.photoUrl = removingPhoto ? null : existing?.photoUrl ?? null;

    // Anything an agency website would show changed after the agency approved it? Then the agency must review it
    // again. Save and downgrade together, so a profile can never be saved with a stale approval.
    const publicFieldsEdited = publicFieldsChanged(accountName, existing, values);
    const downgraded = await db.transaction(async (tx) => {
      if (existing) {
        await tx.update(interpreterProfiles).set(values).where(eq(interpreterProfiles.id, existing.id));
      } else {
        await tx.insert(interpreterProfiles).values({ id: randomUUID(), interpreterId, ...values });
      }
      return publicFieldsEdited ? sendApprovedWebsiteProfilesBackToReview(tx, interpreterId) : 0;
    });

    if (downgraded > 0) {
      await announceWebsiteReReview({
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        interpreterId,
        displayName: values.preferredName || accountName,
        agencies: downgraded,
      });
    }
    // The removed photo's file is no longer referenced: delete its record and stored object.
    if (removingPhoto && existing?.photoUrl) await deletePhotoFile(existing.photoUrl, interpreterId);

    revalidatePath("/profile");
    revalidatePath("/interpreter-calendar");
    return { success: true, profile: await loadProfile(session.user.id, interpreterId), websiteReReview: downgraded > 0 };
  } catch (err) {
    logError("updateMyProfile", err);
    return { success: false, error: "We could not save your profile. Please try again." };
  }
}
