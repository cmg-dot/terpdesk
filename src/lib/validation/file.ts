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
