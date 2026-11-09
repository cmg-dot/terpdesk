import { createHash, randomInt } from "node:crypto";

/**
 * Recovery codes for a lost phone. SERVER ONLY.
 *
 * Each code is 16 characters from Crockford's base32 (no I, L, O or U, so none can be misread): 80 random bits, shown as
 * XXXX-XXXX-XXXX-XXXX. With that much randomness a plain SHA-256 is enough to store (nobody can brute-force 2^80), and it lets the
 * database find a code by its hash directly, the same way the app stores its other one-time tokens.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16;
export const RECOVERY_CODE_COUNT = 10;

const newCode = (): string => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** XXXX-XXXX-XXXX-XXXX */
export const formatRecoveryCode = (code: string): string => code.match(/.{1,4}/g)!.join("-");

export const generateRecoveryCodes = (count: number = RECOVERY_CODE_COUNT): string[] => {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(newCode());
  return Array.from(codes);
};

/** What was typed, reduced to the bare code: case, spaces and dashes ignored, look-alike letters mapped (I, L to 1; O to 0). */
export const normalizeRecoveryCode = (input: string): string =>
  input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");

export const looksLikeRecoveryCode = (input: string): boolean => {
  const code = normalizeRecoveryCode(input);
  return code.length === CODE_LENGTH && code.split("").every((c) => ALPHABET.indexOf(c) >= 0);
};

export const hashRecoveryCode = (input: string): string => createHash("sha256").update(normalizeRecoveryCode(input)).digest("hex");
