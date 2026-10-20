"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, requests } from "@/db/schema";
import type { SelectFile } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { StorageNotConfiguredError, inspectObject, objectUrl, presignUpload, removeObject } from "@/lib/s3";
import { MAX_PREP_FILE_BYTES, PREP_FILE_TYPES, fileNameSchema } from "@/lib/validation/file";
import type { PrepFile } from "@/lib/validation/file";

type Fail = { success: false; error: string };
export type PresignResult = { success: true; uploadUrl: string; fileUrl: string; key: string } | Fail;
export type SaveFileResult = { success: true; file: PrepFile } | Fail;
export type SimpleResult = { success: true } | Fail;

/** Staff accounts have no agency of their own yet, so the workspace's single agency is used. */
const staffAgencyId = (): string => DEFAULT_AGENCY_ID;
const DENIED: Fail = { success: false, error: "You don't have permission to do this." };
const NOT_CONFIGURED: Fail = { success: false, error: "File storage isn't set up yet. Ask your administrator to configure S3." };

const presignSchema = z.object({
  requestId: z.string().uuid(),
  fileName: fileNameSchema,
  fileType: z.string().refine((t) => t in PREP_FILE_TYPES, "This file type isn't allowed."),
  fileSize: z.number().int().positive().max(MAX_PREP_FILE_BYTES, "Files can be up to 25 MB."),
});
const saveSchema = z.object({
  requestId: z.string().uuid(),
  key: z.string().max(400),
  fileName: fileNameSchema,
  sharedWithInterpreters: z.boolean(),
});
const visibilitySchema = z.object({ fileId: z.string().uuid(), sharedWithInterpreters: z.boolean() });

const toPrepFile = (f: SelectFile): PrepFile => ({
  id: f.id,
  fileName: f.fileName,
  contentType: f.contentType,
  sizeBytes: f.sizeBytes,
  sharedWithInterpreters: f.sharedWithInterpreters,
  createdAt: f.createdAt.toISOString(),
});

const isAgency = async () => {
  try {
    return await requireRole("agency");
  } catch {
    return null;
  }
};

/** Object keys are generated here, never by the browser: prep/<requestId>/<uuid>-<safe name>. */
const keyPattern = (requestId: string) => new RegExp(`^prep/${requestId}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$`);
const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100) || "file";

const failFrom = (where: string, err: unknown): Fail => {
  if (err instanceof StorageNotConfiguredError) return NOT_CONFIGURED;
  logError(where, err);
  return { success: false, error: "Something went wrong with the file. Please try again." };
};

/** Step 1 of an upload: a short-lived PUT URL for one prep file on one request (agency staff only). */
export async function generatePresignedUrl(input: z.input<typeof presignSchema>): Promise<PresignResult> {
  if (!(await isAgency())) return DENIED;
  const parsed = presignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid file." };
  const { requestId, fileName, fileType, fileSize } = parsed.data;

  try {
    const [request] = await db.select({ id: requests.id }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!request) return { success: false, error: "This request no longer exists." };
    const key = `prep/${requestId}/${randomUUID()}-${safeName(fileName)}`;
    const uploadUrl = await presignUpload(key, fileType, fileSize);
    return { success: true, uploadUrl, fileUrl: objectUrl(key), key };
  } catch (err) {
    return failFrom("generatePresignedUrl", err);
  }
}

/** Step 3 of an upload: records the file once S3 confirms it arrived (size and type are re-checked there). */
export async function saveFileRecord(input: z.input<typeof saveSchema>): Promise<SaveFileResult> {
  const session = await isAgency();
  if (!session) return DENIED;
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid file details." };
  const { requestId, key, fileName, sharedWithInterpreters } = parsed.data;
  if (!keyPattern(requestId).test(key)) return { success: false, error: "Invalid file details." };

  try {
    await ensureAvailabilityTables();
    const stored = await inspectObject(key);
    if (!stored) return { success: false, error: "The upload didn't finish. Please try again." };
    if (stored.sizeBytes > MAX_PREP_FILE_BYTES || !(stored.contentType in PREP_FILE_TYPES)) {
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
        uploadedByAgencyId: staffAgencyId(),
        linkedJobId: requestId,
        sharedWithInterpreters,
      })
      .returning();

    // Identifiers only: file names can contain client details, so they are not written to the audit trail.
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "prep_file_uploaded",
      details: `fileId=${saved.id}; requestId=${requestId}; shared=${sharedWithInterpreters}`,
    });
    return { success: true, file: toPrepFile(saved) };
  } catch (err) {
    return failFrom("saveFileRecord", err);
  }
}

/** Prep files on one request, newest first (agency staff only). */
export async function listPrepFiles(requestIdInput: string): Promise<PrepFile[]> {
  await requireRole("agency");
  const requestId = z.string().uuid().parse(requestIdInput);
  await ensureAvailabilityTables();
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.linkedJobId, requestId), eq(files.uploadedByAgencyId, staffAgencyId())))
    .orderBy(desc(files.createdAt));
  return rows.map(toPrepFile);
}

/** Agency only, or also the interpreters booked on the job. */
export async function setPrepFileVisibility(input: z.input<typeof visibilitySchema>): Promise<SimpleResult> {
  const session = await isAgency();
  if (!session) return DENIED;
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  try {
    await ensureAvailabilityTables();
    const updated = await db
      .update(files)
      .set({ sharedWithInterpreters: parsed.data.sharedWithInterpreters })
      .where(and(eq(files.id, parsed.data.fileId), eq(files.uploadedByAgencyId, staffAgencyId())))
      .returning({ id: files.id });
    if (updated.length === 0) return { success: false, error: "This file was not found." };
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "prep_file_visibility_changed",
      details: `fileId=${parsed.data.fileId}; shared=${parsed.data.sharedWithInterpreters}`,
    });
    return { success: true };
  } catch (err) {
    return failFrom("setPrepFileVisibility", err);
  }
}

/** Deletes a prep file from S3 and from the database. */
export async function deletePrepFile(fileIdInput: string): Promise<SimpleResult> {
  const session = await isAgency();
  if (!session) return DENIED;
  const id = z.string().uuid().safeParse(fileIdInput);
  if (!id.success) return { success: false, error: "Invalid request." };
  try {
    await ensureAvailabilityTables();
    const [file] = await db
      .select({ key: files.storageKey })
      .from(files)
      .where(and(eq(files.id, id.data), eq(files.uploadedByAgencyId, staffAgencyId())))
      .limit(1);
    if (!file) return { success: false, error: "This file was not found." };
    await removeObject(file.key);
    await db.delete(files).where(eq(files.id, id.data));
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "prep_file_deleted",
      details: `fileId=${id.data}`,
    });
    return { success: true };
  } catch (err) {
    return failFrom("deletePrepFile", err);
  }
}
