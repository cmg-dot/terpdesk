"use server";

import { randomUUID } from "crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { files } from "@/db/schema";
import type { DeleteCredentialFileResult, PresignCredentialFileResult, SaveCredentialFileResult } from "@/app/actions/credentialFiles";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logError";
import { StorageNotConfiguredError, inspectObject, objectUrl, presignUpload, removeObject } from "@/lib/s3";
import { activeCommercialAuto, staffForLoginlessInterpreter } from "@/lib/staffInsuranceAccess";
import { CREDENTIAL_FILE_TYPES, MAX_CREDENTIAL_FILE_BYTES, MAX_FILES_PER_CREDENTIAL, fileNameSchema, safeObjectName } from "@/lib/validation/file";

/**
 * The commercial auto policy's document (a declarations page, a card), uploaded by staff for an interpreter with no login: the same
 * three steps and private storage as the interpreter's own upload (actions/credentialFiles.ts), under the interpreter's own prefix, so
 * the file belongs to the policy whoever added it. Agency staff only; only that interpreter's active commercial auto policy.
 */

type Fail = { success: false; error: string };
const NOT_CONFIGURED: Fail = { success: false, error: "File storage isn't set up yet. Ask your administrator to configure S3." };
const NO_POLICY: Fail = { success: false, error: "Save the policy first, then add its document." };

const ids = { interpreterId: z.string().uuid(), credentialId: z.string().uuid() };
const presignSchema = z.object({
  ...ids,
  fileName: fileNameSchema,
  fileType: z.string().refine((t) => t in CREDENTIAL_FILE_TYPES, "Choose a PDF, JPEG or PNG file."),
  fileSize: z.number().int().positive().max(MAX_CREDENTIAL_FILE_BYTES, "Files can be up to 10 MB."),
});
const saveSchema = z.object({ ...ids, key: z.string().max(400), fileName: fileNameSchema });
const keyPattern = (interpreterId: string, credentialId: string) => new RegExp(`^credentials/${interpreterId}/${credentialId}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$`);

export async function presignStaffCredentialFile(input: z.input<typeof presignSchema>): Promise<PresignCredentialFileResult> {
  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  const access = await staffForLoginlessInterpreter(parsed.data.interpreterId);
  if (!access.ok) return { success: false, error: access.error };
  const { credentialId, fileName, fileType, fileSize } = parsed.data;
  try {
    if (!(await activeCommercialAuto(access.interpreterId, credentialId))) return NO_POLICY;
    const [existing] = await db.select({ total: count() }).from(files).where(eq(files.linkedCredentialId, credentialId));
    if (Number(existing?.total ?? 0) >= MAX_FILES_PER_CREDENTIAL) return { success: false, error: `A policy can have up to ${MAX_FILES_PER_CREDENTIAL} files. Delete one to add another.` };
    const key = `credentials/${access.interpreterId}/${credentialId}/${randomUUID()}-${safeObjectName(fileName)}`;
    return { success: true, uploadUrl: await presignUpload(key, fileType, fileSize), key };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("presignStaffCredentialFile", err);
    return { success: false, error: "We could not start the upload. Please try again." };
  }
}

export async function saveStaffCredentialFile(input: z.input<typeof saveSchema>): Promise<SaveCredentialFileResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !keyPattern(parsed.data.interpreterId, parsed.data.credentialId).test(parsed.data.key)) return { success: false, error: "Invalid file details." };
  const access = await staffForLoginlessInterpreter(parsed.data.interpreterId);
  if (!access.ok) return { success: false, error: access.error };
  const { credentialId, key, fileName } = parsed.data;
  try {
    if (!(await activeCommercialAuto(access.interpreterId, credentialId))) return NO_POLICY;
    const stored = await inspectObject(key);
    if (!stored) return { success: false, error: "The upload didn't finish. Please try again." };
    if (stored.sizeBytes > MAX_CREDENTIAL_FILE_BYTES || !(stored.contentType in CREDENTIAL_FILE_TYPES)) {
      await removeObject(key);
      return { success: false, error: "That file isn't allowed." };
    }
    const [saved] = await db
      .insert(files)
      .values({ fileUrl: objectUrl(key), storageKey: key, fileName, contentType: stored.contentType, sizeBytes: stored.sizeBytes, uploadedByAgencyId: DEFAULT_AGENCY_ID, linkedCredentialId: credentialId })
      .returning();
    // Identifiers only: a file name can say what the document is.
    await writeAuditLog({ userId: access.session.user.id, userEmail: access.session.user.email ?? null, action: "credential_file_added_by_staff", details: `credentialId=${credentialId}; fileId=${saved.id}` });
    revalidatePath(`/interpreters/${access.interpreterId}`);
    return { success: true, file: { id: saved.id, fileName: saved.fileName, contentType: saved.contentType, sizeBytes: saved.sizeBytes } };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("saveStaffCredentialFile", err);
    return { success: false, error: "We could not save this file. Please try again." };
  }
}

export async function deleteStaffCredentialFile(input: { interpreterId: string; fileId: string }): Promise<DeleteCredentialFileResult> {
  const parsed = z.object({ interpreterId: z.string().uuid(), fileId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const access = await staffForLoginlessInterpreter(parsed.data.interpreterId);
  if (!access.ok) return { success: false, error: access.error };
  try {
    const policy = await activeCommercialAuto(access.interpreterId);
    if (!policy) return { success: false, error: "This file was not found." };
    const [file] = await db.select({ key: files.storageKey }).from(files).where(and(eq(files.id, parsed.data.fileId), eq(files.linkedCredentialId, policy.id))).limit(1);
    if (!file) return { success: false, error: "This file was not found." };
    await removeObject(file.key);
    await db.delete(files).where(eq(files.id, parsed.data.fileId));
    await writeAuditLog({ userId: access.session.user.id, userEmail: access.session.user.email ?? null, action: "credential_file_deleted_by_staff", details: `fileId=${parsed.data.fileId}` });
    revalidatePath(`/interpreters/${access.interpreterId}`);
    return { success: true };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
    logError("deleteStaffCredentialFile", err);
    return { success: false, error: "We could not delete this file. Please try again." };
  }
}
