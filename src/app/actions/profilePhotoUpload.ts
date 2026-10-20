"use server";

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { files, interpreterProfiles } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { ensureAgencyInterpreterColumns } from "@/lib/agencyInterpreterColumns";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { logError } from "@/lib/logError";
import { deletePhotoFile } from "@/lib/profilePhoto";
import { StorageNotConfiguredError, inspectObject, objectUrl, presignUpload, removeObject } from "@/lib/s3";
import { MAX_PHOTO_BYTES, PHOTO_FILE_TYPES, fileNameSchema, photoPathFor, safeObjectName } from "@/lib/validation/file";
import { announceWebsiteReReview, sendApprovedWebsiteProfilesBackToReview } from "@/lib/websiteReview";

type Fail = { success: false; error: string };
export type PresignPhotoResult = { success: true; uploadUrl: string; key: string } | Fail;
export type SavePhotoResult = { success: true; photoUrl: string; websiteReReview: boolean } | Fail;

const NOT_LINKED: Fail = { success: false, error: "Connect your interpreter profile (use the link we emailed you) first." };
const NOT_CONFIGURED: Fail = { success: false, error: "File storage isn't set up yet. Ask your administrator to configure S3." };

const presignSchema = z.object({
  fileName: fileNameSchema,
  fileType: z.string().refine((t) => t in PHOTO_FILE_TYPES, "Choose a JPEG, PNG or WebP image."),
  fileSize: z.number().int().positive().max(MAX_PHOTO_BYTES, "Photos can be up to 5 MB."),
});
const saveSchema = z.object({ key: z.string().max(400), fileName: fileNameSchema });

/** photos/<interpreterId>/<uuid>-<safe name>: the key is generated here, and only keys under the caller's own prefix are accepted. */
const keyPattern = (interpreterId: string) => new RegExp(`^photos/${interpreterId}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$`);

const interpreterOrNull = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

/** Step 1: a short-lived PUT URL for the signed-in interpreter's profile photo. */
export async function presignProfilePhoto(input: z.input<typeof presignSchema>): Promise<PresignPhotoResult> {
  const me = await interpreterOrNull();
  if (!me) return NOT_LINKED;
  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid photo." };
  try {
    const key = `photos/${me.interpreterId}/${randomUUID()}-${safeObjectName(parsed.data.fileName)}`;
    return { success: true, uploadUrl: await presignUpload(key, parsed.data.fileType, parsed.data.fileSize), key };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("presignProfilePhoto", err);
    return { success: false, error: "We could not start the upload. Please try again." };
  }
}

/**
 * Step 3: once S3 confirms the file arrived, record it and make it the profile photo. The previous photo is deleted.
 * A new photo changes what an agency website would show, so approved website profiles go back to review.
 */
export async function saveProfilePhoto(input: z.input<typeof saveSchema>): Promise<SavePhotoResult> {
  const me = await interpreterOrNull();
  if (!me) return NOT_LINKED;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !keyPattern(me.interpreterId).test(parsed.data.key)) return { success: false, error: "Invalid photo details." };
  const { key, fileName } = parsed.data;

  try {
    await ensureAvailabilityTables();
    await ensureAgencyInterpreterColumns();
    const stored = await inspectObject(key);
    if (!stored) return { success: false, error: "The upload didn't finish. Please try again." };
    if (stored.sizeBytes > MAX_PHOTO_BYTES || !(stored.contentType in PHOTO_FILE_TYPES)) {
      await removeObject(key);
      return { success: false, error: "That file isn't an allowed photo." };
    }

    const [existing] = await db
      .select()
      .from(interpreterProfiles)
      .where(eq(interpreterProfiles.interpreterId, me.interpreterId))
      .orderBy(desc(interpreterProfiles.updatedAt))
      .limit(1);

    const { photoUrl, downgraded } = await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(files)
        .values({
          fileUrl: objectUrl(key),
          storageKey: key,
          fileName,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
          uploadedByInterpreterId: me.interpreterId,
        })
        .returning({ id: files.id });
      const path = photoPathFor(saved.id);
      if (existing) {
        await tx.update(interpreterProfiles).set({ photoUrl: path, updatedAt: new Date() }).where(eq(interpreterProfiles.id, existing.id));
      } else {
        await tx.insert(interpreterProfiles).values({ id: randomUUID(), interpreterId: me.interpreterId, photoUrl: path });
      }
      return { photoUrl: path, downgraded: await sendApprovedWebsiteProfilesBackToReview(tx, me.interpreterId) };
    });

    if (existing?.photoUrl) await deletePhotoFile(existing.photoUrl, me.interpreterId);

    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "profile_photo_changed",
      details: `interpreterId=${me.interpreterId}`,
    });
    if (downgraded > 0) {
      await announceWebsiteReReview({
        userId: me.session.user.id,
        userEmail: me.session.user.email ?? null,
        interpreterId: me.interpreterId,
        displayName: (await getInterpreterDisplayName(me.interpreterId).catch(() => null)) ?? "",
        agencies: downgraded,
      });
    }
    revalidatePath("/profile");
    return { success: true, photoUrl, websiteReReview: downgraded > 0 };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("saveProfilePhoto", err);
    return { success: false, error: "We could not save your photo. Please try again." };
  }
}
