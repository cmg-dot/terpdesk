import { randomUUID } from "crypto";
import { uploadObject } from "@/lib/s3";
import { onsiteSignoffInputSchema } from "@/lib/onsiteSignature";
import type { OnsiteSignoff } from "@/lib/onsiteSignature";

/**
 * Saves the on-site contact's sign-off: the signature picture goes to the PRIVATE bucket under `onsite-signatures/`, and
 * the caller keeps only the returned record (printed name, time, storage key) on the hours record. Keeping the picture
 * out of `requests.data` means it is not copied into every request read.
 *
 * Nothing the browser sends is trusted: the input is parsed again here, the file type is read from the image's own first
 * bytes, the size is capped, and the stored name is generated here. Throws when the input is invalid or storage is
 * unavailable, so a required sign-off is never silently skipped.
 *
 * SERVER ONLY.
 */

const DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_PNG_BYTES = 64;
const MAX_PNG_BYTES = 300_000;

/** The storage key for a request's sign-off picture; the download side checks a key starts with this before using it. */
export const onsiteKeyPrefix = (requestId: string): string => `onsite-signatures/${requestId}/`;

const decodePng = (dataUrl: string): Buffer => {
  const bytes = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
  if (bytes.length < MIN_PNG_BYTES || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error("The on-site contact's signature is not a valid image.");
  }
  return bytes;
};

export async function saveOnsiteSignoff(requestId: string, input: unknown): Promise<OnsiteSignoff> {
  const parsed = onsiteSignoffInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "The on-site sign-off is not valid.");
  const bytes = decodePng(parsed.data.signatureDataUrl);
  const storageKey = `${onsiteKeyPrefix(requestId)}${randomUUID()}.png`;
  await uploadObject(storageKey, bytes, "image/png");
  return { printedName: parsed.data.printedName, signedAt: new Date().toISOString(), storageKey };
}
