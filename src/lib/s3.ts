import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 storage for uploaded files. The bucket must stay PRIVATE (block all public access): files can contain PHI.
 * Uploads and downloads use short-lived presigned URLs that are only issued after an authorization check.
 *
 * Env: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, and S3_REGION or AWS_REGION.
 * (S3_REGION wins: some hosts set AWS_REGION to their own region, which may differ from the bucket's.)
 *
 * SERVER ONLY.
 */

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured.");
  }
}

interface S3Config {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const readConfig = (): S3Config => {
  const region = process.env.S3_REGION || process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  // Checked when used, not at import, so a missing variable can never break the build.
  if (!region || !bucket || !accessKeyId || !secretAccessKey) throw new StorageNotConfiguredError();
  return { region, bucket, accessKeyId, secretAccessKey };
};

let cached: { client: S3Client; config: S3Config } | null = null;

const storage = () => {
  if (!cached) {
    const config = readConfig();
    const client = new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    cached = { client, config };
  }
  return cached;
};

/** The object's address (for reference only; the bucket is private, so it does not open without a signature). */
export const objectUrl = (key: string): string => {
  const { config } = storage();
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
};

/**
 * A PUT URL for exactly this object, type and size. Content-Type and Content-Length are part of the signature,
 * so S3 rejects an upload of a different type or size than the one that was authorized.
 */
export async function presignUpload(key: string, contentType: string, sizeBytes: number): Promise<string> {
  const { client, config } = storage();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
}

/** Server-side upload for a file the server already holds (the intake webhook), so no presigned PUT is needed. */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, config } = storage();
  await client.send(
    new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }),
  );
}

/** A short-lived GET URL. `fileName` is offered to the browser as the download name. */
export async function presignDownload(key: string, fileName: string): Promise<string> {
  const { client, config } = storage();
  const safeName = fileName.replace(/["\\\r\n]/g, "_");
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentDisposition: `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}

/** The stored object's size and type, or null when nothing was uploaded under this key. */
export async function inspectObject(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
  const { client, config } = storage();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return { sizeBytes: Number(head.ContentLength ?? 0), contentType: head.ContentType ?? "application/octet-stream" };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return null;
    throw err;
  }
}

export async function removeObject(key: string): Promise<void> {
  const { client, config } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

/**
 * Best-effort cleanup for objects whose database rows are already gone. A failure is logged by key count only and
 * never blocks the action, since an orphaned private object is harmless and the user's change has already happened.
 */
export async function removeObjectsQuietly(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await removeObject(key);
    } catch {
      console.error("[s3] could not remove an object during cleanup");
    }
  }
}
