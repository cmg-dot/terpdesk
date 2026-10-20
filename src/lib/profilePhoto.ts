import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { logError } from "@/lib/logError";
import { removeObjectsQuietly } from "@/lib/s3";
import { PHOTO_PATH_PATTERN } from "@/lib/validation/file";

/**
 * Deletes the file record and stored object behind a profile photo path ("/api/files/<id>"). Only a photo that
 * belongs to this interpreter is touched. Older photos that were plain links have no file, so they are skipped.
 * Never throws: leftover cleanup must not undo the change that triggered it.
 *
 * SERVER ONLY.
 */
export async function deletePhotoFile(photoPath: string, interpreterId: string): Promise<void> {
  if (!PHOTO_PATH_PATTERN.test(photoPath)) return;
  const fileId = photoPath.slice("/api/files/".length);
  try {
    const removed = await db
      .delete(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.uploadedByInterpreterId, interpreterId),
          isNull(files.linkedJobId),
          isNull(files.linkedCredentialId),
        ),
      )
      .returning({ key: files.storageKey });
    await removeObjectsQuietly(removed.map((r) => r.key));
  } catch (err) {
    logError("deletePhotoFile", err);
  }
}
