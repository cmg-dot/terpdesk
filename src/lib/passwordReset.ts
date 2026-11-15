import { randomBytes } from "crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { hashToken } from "@/lib/timesheetToken";

/**
 * Password reset links. SERVER ONLY. They live in `verification_tokens` beside the profile-claim links, told apart by the identifier
 * `password-reset:<email>`: a claim link cannot reset a password, a reset link cannot claim a profile (verifyClaim looks up a login by
 * the identifier, and no login is called "password-reset:..."), and re-sending a claim link never deletes a reset link.
 * Only the SHA-256 hash is stored; the raw token exists only in the emailed link. One live link per address, valid for 60 minutes,
 * used up only when the new password is submitted (opening the link changes nothing, so mail scanners cannot spend it).
 */

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PREFIX = "password-reset:";
export const RESET_TOKEN_SHAPE = /^[a-f0-9]{64}$/;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResetLinkProblem = "invalid" | "expired";

export const RESET_LINK_PROBLEMS: Record<ResetLinkProblem, string> = {
  invalid: "This reset link is not valid. It may already have been used, or a newer link may have replaced it. Request a new one below.",
  expired: "This reset link has expired. Request a new one below.",
};

const identifierFor = (email: string): string => `${PREFIX}${email}`;
const isResetIdentifier = like(verificationTokens.identifier, `${PREFIX}%`);

/** A new reset link token for this (lower-cased) address, replacing any earlier one. Returns the raw token for the email. */
export async function issueResetToken(email: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const identifier = identifierFor(email);
  await db.transaction(async (tx) => {
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await tx.insert(verificationTokens).values({ identifier, token: hashToken(rawToken), expires: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
  });
  return rawToken;
}

/** Read-only check when the page opens: never uses the token up. */
export async function resetLinkProblem(token: string): Promise<ResetLinkProblem | null> {
  if (!RESET_TOKEN_SHAPE.test(token)) return "invalid";
  const [row] = await db
    .select({ expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(and(eq(verificationTokens.token, hashToken(token)), isResetIdentifier))
    .limit(1);
  if (!row) return "invalid";
  return row.expires.getTime() < Date.now() ? "expired" : null;
}

/**
 * Uses the token up inside the caller's transaction (a single DELETE ... RETURNING, so two submits cannot both pass) and every other
 * reset link for the same address. Returns the address, or why it cannot be used. An expired token is removed too.
 */
export async function consumeResetToken(tx: Tx, token: string): Promise<{ email: string } | { problem: ResetLinkProblem }> {
  if (!RESET_TOKEN_SHAPE.test(token)) return { problem: "invalid" };
  const [row] = await tx
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.token, hashToken(token)), isResetIdentifier))
    .returning({ identifier: verificationTokens.identifier, expires: verificationTokens.expires });
  if (!row) return { problem: "invalid" };
  if (row.expires.getTime() < Date.now()) return { problem: "expired" };
  await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, row.identifier));
  return { email: row.identifier.slice(PREFIX.length) };
}
