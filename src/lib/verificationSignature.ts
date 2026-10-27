import { randomUUID } from "crypto";
import { z } from "zod";
import { uploadObject } from "@/lib/s3";

/**
 * The signature file that comes with an ODHH service verification (a PDF or an image the Lambda forwards as base64).
 *
 * Nothing the sender claims is trusted: the file type is read from the file's own first bytes, the size is capped,
 * the stored name is generated here, and inline pictures (logos in the email body) are never taken for a signature.
 * The bucket is PRIVATE: staff open the file through /api/verification-signature/<timesheetId>, which checks their
 * session and redirects to a 5-minute signed link. No public URL is ever created.
 *
 * `pickSignature` is pure (no I/O); `storeSignature` is the only part that touches S3.
 * SERVER ONLY.
 */

export const MAX_SIGNATURE_BYTES = 2_500_000;
const MIN_SIGNATURE_BYTES = 64;
const MAX_ATTACHMENTS_READ = 5;

const attachmentsSchema = z
  .array(
    z.object({
      filename: z.string().max(255).optional(),
      contentType: z.string().max(100).optional(),
      inline: z.boolean().optional(),
      contentBase64: z.string().max(Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 8),
    }),
  )
  .max(MAX_ATTACHMENTS_READ);

/** The file types a signature may be, recognised by their first bytes. */
const SIGNATURE_TYPES: { type: string; ext: string; matches: (b: Buffer) => boolean }[] = [
  { type: "application/pdf", ext: "pdf", matches: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { type: "image/png", ext: "png", matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { type: "image/jpeg", ext: "jpg", matches: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { type: "image/gif", ext: "gif", matches: (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
  { type: "image/webp", ext: "webp", matches: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { type: "image/tiff", ext: "tif", matches: (b) => ["II*\0", "MM\0*"].includes(b.subarray(0, 4).toString("latin1")) },
  { type: "image/bmp", ext: "bmp", matches: (b) => b.subarray(0, 2).toString("latin1") === "BM" },
  { type: "image/heic", ext: "heic", matches: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && ["heic", "heix", "mif1"].includes(b.subarray(8, 12).toString("latin1")) },
];

export interface SignatureFile {
  bytes: Buffer;
  contentType: string;
  ext: string;
  /** The sender's file name with anything unusual replaced; for display only, never used as a storage path. */
  fileName: string;
}

export interface StoredSignature {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  savedAt: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const displayName = (name: string | undefined, ext: string): string => {
  const cleaned = (name ?? "").replace(/^.*[\\/]/, "").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 100);
  return cleaned || `signature.${ext}`;
};

/**
 * The first attached file that really is a PDF or image of a sensible size, or null when there is none.
 * Inline pictures are skipped: they are logos and banners that belong to the email's layout.
 */
export function pickSignature(attachments: unknown): SignatureFile | null {
  const parsed = attachmentsSchema.safeParse(attachments);
  if (!parsed.success) return null;

  for (const item of parsed.data) {
    if (item.inline === true) continue;
    const data = item.contentBase64.replace(/\s+/g, "");
    if (!BASE64.test(data)) continue;
    const bytes = Buffer.from(data, "base64");
    if (bytes.length < MIN_SIGNATURE_BYTES || bytes.length > MAX_SIGNATURE_BYTES) continue;
    const kind = SIGNATURE_TYPES.find((candidate) => candidate.matches(bytes));
    if (kind) return { bytes, contentType: kind.type, ext: kind.ext, fileName: displayName(item.filename, kind.ext) };
  }
  return null;
}

/** Uploads the signature to the private bucket under a name generated here. Throws if storage is unavailable. */
export async function storeSignature(requestId: string, file: SignatureFile): Promise<StoredSignature> {
  const storageKey = `verification-signatures/${requestId}/${randomUUID()}.${file.ext}`;
  await uploadObject(storageKey, file.bytes, file.contentType);
  return { storageKey, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.bytes.length, savedAt: new Date().toISOString() };
}

/** Where the review screen loads the signature from (an app route that checks the staff session). */
export const signatureUrlFor = (timesheetId: string): string => `/api/verification-signature/${timesheetId}`;
