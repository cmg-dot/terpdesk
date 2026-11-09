import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mfaKey } from "@/lib/mfa/config";

/**
 * Seals and opens an authenticator secret (AES-256-GCM). SERVER ONLY.
 *
 * Stored form: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. The version prefix is what lets a future key be rotated. The
 * owner's user id is bound in as authenticated data, so a sealed secret copied onto another login's row simply fails to open.
 * `openSecret` returns null for anything it cannot trust (wrong key, tampering, wrong owner, bad shape): never throws.
 */

const VERSION = "v1";
const encode = (b: Buffer): string => b.toString("base64url");

export function sealSecret(plain: string, userId: string): string {
  const key = mfaKey();
  if (!key) throw new Error("MFA_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

export function openSecret(sealed: string, userId: string): string | null {
  const key = mfaKey();
  if (!key) return null;
  const [version, iv, tag, ciphertext, ...rest] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext || rest.length > 0) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
