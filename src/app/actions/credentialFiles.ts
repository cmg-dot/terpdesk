"use server";

import { randomUUID } from "crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { credentials, files } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { StorageNotConfiguredError, inspectObject, objectUrl, presignUpload, removeObject } from "@/lib/s3";
import {
  CREDENTIAL_FILE_TYPES,
  MAX_CREDENTIAL_FILE_BYTES,
  MAX_FILES_PER_CREDENTIAL,
  fileNameSchema,
  safeObjectName,
} from "@/lib/validation/file";
import type { CredentialFile } from "@/lib/validation/file";

type Fail = { success: false; error: string };
export type PresignCredentialFileResult = { success: true; uploadUrl: string; key: string } | Fail;
export type SaveCredentialFileResult = { success: true; file: CredentialFile } | Fail;
export type DeleteCredentialFileResult = { success: true } | Fail;

const NOT_LINKED: Fail = { success: false, error: "Connect your interpreter profile (use the link we emailed you) first." };
const NOT_CONFIGURED: Fail = { success: false, error: "File storage isn't set up yet. Ask your administrator to configure S3." };
const NOT_FOUND: Fail = { success: false, error: "This credential was not found. It may have been archived." };

const presignSchema = z.object({
  credentialId: z.string().uuid(),
  fileName: fileNameSchema,
  fileType: z.string().refine((t) => t in CREDENTIAL_FILE_TYPES, "Choose a PDF, JPEG or PNG file."),
  fileSize: z.number().int().positive().max(MAX_CREDENTIAL_FILE_BYTES, "Files can be up to 10 MB."),
});
const saveSchema = z.object({ credentialId: z.string().uuid(), key: z.string().max(400), fileName: fileNameSchema });

/** credentials/<interpreterId>/<credentialId>/<uuid>-<safe name>: generated here; only the caller's own prefix is accepted. */
const keyPattern = (interpreterId: string, credentialId: string) =>
  new RegExp(`^credentials/${interpreterId}/${credentialId}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$`);

const interpreterOrNull = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

/** The interpreter's own, active credential: the only kind a file can be attached to. */
const ownActiveCredential = async (interpreterId: string, credentialId: string) => {
  const [row] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.id, credentialId), eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false)))
    .limit(1);
  return row ?? null;
};

/** Step 1: a short-lived PUT URL for one supporting file on one of the interpreter's own credentials. */
export async function presignCredentialFile(input: z.input<typeof presignSchema>): Promise<PresignCredentialFileResult> {
  const me = await interpreterOrNull();
  if (!me) return NOT_LINKED;
  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  const { credentialId, fileName, fileType, fileSize } = parsed.data;

  try {
    await ensureAvailabilityTables();
    if (!(await ownActiveCredential(me.interpreterId, credentialId))) return NOT_FOUND;
    const [existing] = await db.select({ total: count() }).from(files).where(eq(files.linkedCredentialId, credentialId));
    if (Number(existing?.total ?? 0) >= MAX_FILES_PER_CREDENTIAL) {
      return { success: false, error: `A credential can have up to ${MAX_FILES_PER_CREDENTIAL} files. Delete one to add another.` };
    }
    const key = `credentials/${me.interpreterId}/${credentialId}/${randomUUID()}-${safeObjectName(fileName)}`;
    return { success: true, uploadUrl: await presignUpload(key, fileType, fileSize), key };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("presignCredentialFile", err);
    return { success: false, error: "We could not start the upload. Please try again." };
  }
}

/** Step 3: once S3 confirms the file arrived (size and type re-checked there), attach it to the credential. */
export async function saveCredentialFile(input: z.input<typeof saveSchema>): Promise<SaveCredentialFileResult> {
  const me = await interpreterOrNull();
  if (!me) return NOT_LINKED;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !keyPattern(me.interpreterId, parsed.data.credentialId).test(parsed.data.key)) {
    return { success: false, error: "Invalid file details." };
  }
  const { credentialId, key, fileName } = parsed.data;

  try {
    await ensureAvailabilityTables();
    if (!(await ownActiveCredential(me.interpreterId, credentialId))) return NOT_FOUND;
    const stored = await inspectObject(key);
    if (!stored) return { success: false, error: "The upload didn't finish. Please try again." };
    if (stored.sizeBytes > MAX_CREDENTIAL_FILE_BYTES || !(stored.contentType in CREDENTIAL_FILE_TYPES)) {
      await removeObject(key);
      return { success: false, error: "That file isn't allowed." };
    }

    const [saved] = await db
      .insert(files)
      .values({
        fileUrl: objectUrl(key),
        storageKey: key,
        fileName,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
        uploadedByInterpreterId: me.interpreterId,
        linkedCredentialId: credentialId,
      })
      .returning();

    // Identifiers only: file names can reveal what a credential is, so they are not written to the audit trail.
    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_file_added",
      details: `credentialId=${credentialId}; fileId=${saved.id}`,
    });
    revalidatePath("/profile");
    return { success: true, file: { id: saved.id, fileName: saved.fileName, contentType: saved.contentType, sizeBytes: saved.sizeBytes } };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("saveCredentialFile", err);
    return { success: false, error: "We could not save this file. Please try again." };
  }
}

/** Deletes one supporting file (record and stored object). Only the credential's own interpreter can. */
export async function deleteCredentialFile(fileIdInput: string): Promise<DeleteCredentialFileResult> {
  const me = await interpreterOrNull();
  if (!me) return NOT_LINKED;
  const id = z.string().uuid().safeParse(fileIdInput);
  if (!id.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    const [file] = await db
      .select({ key: files.storageKey })
      .from(files)
      .innerJoin(credentials, eq(credentials.id, files.linkedCredentialId))
      .where(and(eq(files.id, id.data), eq(credentials.interpreterId, me.interpreterId)))
      .limit(1);
    if (!file) return { success: false, error: "This file was not found." };

    await removeObject(file.key);
    await db.delete(files).where(eq(files.id, id.data));
    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_file_deleted",
      details: `fileId=${id.data}`,
    });
    revalidatePath("/profile");
    return { success: true };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("deleteCredentialFile", err);
    return { success: false, error: "We could not delete this file. Please try again." };
  }
}
