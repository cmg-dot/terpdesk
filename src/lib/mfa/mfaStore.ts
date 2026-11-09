import { and, count, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { userMfa, userRecoveryCodes } from "@/db/schema";

/**
 * Reads and writes for the two two-step-verification tables. SERVER ONLY. Every function takes the user id the caller got from
 * the session (never from a request) and an optional `exec`, so a test can run the whole thing inside a transaction it rolls back.
 */

export type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "transaction">;

export interface MfaRow {
  secretEnc: string;
  confirmedAt: Date | null;
  lastUsedStep: number | null;
}

export async function getMfa(userId: string, exec: Executor = db): Promise<MfaRow | null> {
  const [row] = await exec
    .select({ secretEnc: userMfa.secretEnc, confirmedAt: userMfa.confirmedAt, lastUsedStep: userMfa.lastUsedStep })
    .from(userMfa)
    .where(eq(userMfa.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Starts (or restarts) enrolment with a fresh sealed secret. An unconfirmed enrolment is simply replaced; an already
 * confirmed authenticator is never overwritten from here. Returns whether the secret was stored.
 */
export async function beginEnrollment(userId: string, secretEnc: string, exec: Executor = db): Promise<boolean> {
  const stored = await exec
    .insert(userMfa)
    .values({ userId, secretEnc })
    .onConflictDoUpdate({ target: userMfa.userId, set: { secretEnc, lastUsedStep: null, updatedAt: new Date() }, setWhere: isNull(userMfa.confirmedAt) })
    .returning({ userId: userMfa.userId });
  return stored.length > 0;
}

/** Confirms a pending enrolment and stores its recovery code hashes in one step. False if there was nothing pending. */
export async function completeEnrollment(userId: string, step: number, recoveryHashes: string[], exec: Executor = db): Promise<boolean> {
  return exec.transaction(async (tx) => {
    const confirmed = await tx
      .update(userMfa)
      .set({ confirmedAt: new Date(), lastUsedStep: step, updatedAt: new Date() })
      .where(and(eq(userMfa.userId, userId), isNull(userMfa.confirmedAt)))
      .returning({ userId: userMfa.userId });
    if (confirmed.length === 0) return false;
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    if (recoveryHashes.length > 0) await tx.insert(userRecoveryCodes).values(recoveryHashes.map((codeHash) => ({ userId, codeHash })));
    return true;
  });
}

/**
 * Records that a code from this time step was used. False when that step (or a later one) was already used: a code works once.
 * One conditional UPDATE, so two simultaneous sign-ins with the same code cannot both succeed.
 */
export async function claimStep(userId: string, step: number, exec: Executor = db): Promise<boolean> {
  const claimed = await exec
    .update(userMfa)
    .set({ lastUsedStep: step, updatedAt: new Date() })
    .where(and(eq(userMfa.userId, userId), isNotNull(userMfa.confirmedAt), or(isNull(userMfa.lastUsedStep), lt(userMfa.lastUsedStep, step))))
    .returning({ userId: userMfa.userId });
  return claimed.length > 0;
}

/** Uses up one recovery code (by hash). False when it does not exist or was already used. */
export async function consumeRecoveryCode(userId: string, codeHash: string, exec: Executor = db): Promise<boolean> {
  const used = await exec
    .update(userRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(userRecoveryCodes.userId, userId), eq(userRecoveryCodes.codeHash, codeHash), isNull(userRecoveryCodes.usedAt)))
    .returning({ id: userRecoveryCodes.id });
  return used.length > 0;
}

export async function countRecoveryCodesLeft(userId: string, exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ left: count() })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));
  return Number(row?.left ?? 0);
}

/** Replaces every recovery code (used and unused) with a new set. */
export async function replaceRecoveryCodes(userId: string, recoveryHashes: string[], exec: Executor = db): Promise<void> {
  await exec.transaction(async (tx) => {
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    if (recoveryHashes.length > 0) await tx.insert(userRecoveryCodes).values(recoveryHashes.map((codeHash) => ({ userId, codeHash })));
  });
}

/** Turns two-step verification off for this login: the authenticator and every recovery code are removed. */
export async function removeMfa(userId: string, exec: Executor = db): Promise<void> {
  await exec.transaction(async (tx) => {
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
  });
}
