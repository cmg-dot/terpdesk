"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files, requests } from "@/db/schema";
import type { SelectFile } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter, requireSession } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { bookedRequestIds } from "@/lib/prepAccess";
import { StorageNotConfiguredError, presignDownload } from "@/lib/s3";
import type { InterpreterPrepFile, PrepFile } from "@/lib/validation/file";
import { formatReference } from "@/utils/statusEngine";
import { resolveRequestTimes } from "@/utils/timezone";

export type DownloadUrlResult = { success: true; url: string } | { success: false; error: string };

const NOT_FOUND = "This file isn't available to you.";

const toPrepFile = (f: SelectFile): PrepFile => ({
  id: f.id,
  fileName: f.fileName,
  contentType: f.contentType,
  sizeBytes: f.sizeBytes,
  sharedWithInterpreters: f.sharedWithInterpreters,
  createdAt: f.createdAt.toISOString(),
});

/**
 * A 5-minute link to open one file. Agency staff may open their agency's files; an interpreter may open a prep
 * file only if the agency shared it with interpreters AND they are booked on that job. Every open is audited.
 */
export async function getFileDownloadUrl(fileIdInput: string): Promise<DownloadUrlResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { success: false, error: "Please sign in again." };
  }
  const id = z.string().uuid().safeParse(fileIdInput);
  if (!id.success) return { success: false, error: NOT_FOUND };

  try {
    await ensureAvailabilityTables();
    const [file] = await db.select().from(files).where(eq(files.id, id.data)).limit(1);
    if (!file) return { success: false, error: NOT_FOUND };

    if (session.user.role === "agency") {
      if (file.uploadedByAgencyId !== DEFAULT_AGENCY_ID) return { success: false, error: NOT_FOUND };
    } else {
      let interpreterId: string;
      try {
        ({ interpreterId } = await requireInterpreter());
      } catch {
        return { success: false, error: NOT_FOUND };
      }
      const booked = file.linkedJobId ? (await bookedRequestIds(interpreterId)).includes(file.linkedJobId) : false;
      if (!file.sharedWithInterpreters || !booked) return { success: false, error: NOT_FOUND };
    }

    const url = await presignDownload(file.storageKey, file.fileName);
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "file_opened",
      details: `fileId=${file.id}; role=${session.user.role}`,
    });
    return { success: true, url };
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) return { success: false, error: "File storage isn't set up yet." };
    logError("getFileDownloadUrl", err);
    return { success: false, error: "We could not open this file. Please try again." };
  }
}

/** Prep files shared with interpreters on jobs the signed-in interpreter is booked on, newest first. */
export async function getMyPrepMaterials(): Promise<InterpreterPrepFile[]> {
  const { interpreterId } = await requireInterpreter();
  await ensureAvailabilityTables();

  const requestIds = await bookedRequestIds(interpreterId);
  if (requestIds.length === 0) return [];

  const rows = await db
    .select({ file: files, requestCreatedAt: requests.createdAt, requestData: requests.data })
    .from(files)
    .innerJoin(requests, eq(requests.id, files.linkedJobId))
    .where(and(inArray(files.linkedJobId, requestIds), eq(files.sharedWithInterpreters, true)))
    .orderBy(desc(files.createdAt));

  const result: InterpreterPrepFile[] = [];
  for (const { file, requestCreatedAt, requestData } of rows) {
    if (!file.linkedJobId) continue;
    let jobStartsAt: string | null = null;
    try {
      jobStartsAt = resolveRequestTimes({ createdAt: requestCreatedAt, data: requestData }).startsAt;
    } catch {
      jobStartsAt = null;
    }
    result.push({ ...toPrepFile(file), jobId: file.linkedJobId, jobReference: formatReference(file.linkedJobId), jobStartsAt });
  }
  return result;
}

/**
 * Shared prep files for ONE job (the Job view). `requestId` is the request the job belongs to; it is only honoured
 * when the signed-in interpreter is booked on it, so passing someone else's request id returns nothing.
 */
export async function getPrepFilesForJob(requestIdInput: string): Promise<PrepFile[]> {
  const { interpreterId } = await requireInterpreter();
  const requestId = z.string().uuid().safeParse(requestIdInput);
  if (!requestId.success) return [];
  await ensureAvailabilityTables();

  if (!(await bookedRequestIds(interpreterId)).includes(requestId.data)) return [];
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.linkedJobId, requestId.data), eq(files.sharedWithInterpreters, true)))
    .orderBy(desc(files.createdAt));
  return rows.map(toPrepFile);
}
