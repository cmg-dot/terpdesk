import { z } from "zod";

/** File types accepted for prep materials (checked in the browser and again on the server). */
export const PREP_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "text/plain": "Text",
};

export const PREP_FILE_ACCEPT = Object.keys(PREP_FILE_TYPES).join(",");
export const MAX_PREP_FILE_BYTES = 25 * 1024 * 1024;

export const fileNameSchema = z.string().trim().min(1, "The file needs a name.").max(200, "That file name is too long.");

/** A prep file as the browser sees it: no storage key or URL, only an id to request a signed link with. */
export interface PrepFile {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sharedWithInterpreters: boolean;
  createdAt: string;
}

/** A prep file on the interpreter's Prep page, with the job it belongs to. */
export interface InterpreterPrepFile extends PrepFile {
  jobId: string;
  jobReference: string;
  jobStartsAt: string | null;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Profile photos: images only (JPEG, PNG, WebP), up to 5 MB. */
export const PHOTO_FILE_TYPES: Record<string, string> = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" };
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Credential supporting files: PDF, JPEG or PNG, up to 10 MB each, at most 10 per credential. */
export const CREDENTIAL_FILE_TYPES: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPEG", "image/png": "PNG" };
export const MAX_CREDENTIAL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_CREDENTIAL = 10;

/** A profile photo is stored as an internal path that the authorized file route serves (the bucket is private). */
export const PHOTO_PATH_PATTERN = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const photoPathFor = (fileId: string): string => `/api/files/${fileId}`;

/** A file name made safe to use inside an S3 object key. */
export const safeObjectName = (name: string): string => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100) || "file";

/** A supporting file attached to a credential, as the browser sees it. */
export interface CredentialFile {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}
