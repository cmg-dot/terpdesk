import { and, asc, count, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { userMfa, userMfaDevices, userRecoveryCodes, users } from "@/db/schema";

/**
 * Reads and writes for the two-step-verification tables: authenticator devices and recovery codes. SERVER ONLY. Every function takes
 * the user id the caller got from the session (never from a request) and an optional `exec`, so a test can run the whole thing inside
 * a transaction it rolls back. Two-step is ON for a login if and only if it has a confirmed device here: there is no second flag.
 * Anything that changes a login's devices first locks that login's row, so two tabs cannot both pass a "not the last one" or a
 * "room for another" check.
 */

export type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "transaction">;
type Tx = Parameters<Parameters<Executor["transaction"]>[0]>[0];

export const MAX_DEVICES = 5;

export interface MfaDevice {
  id: string;
  label: string;
  secretEnc: string;
  confirmedAt: Date | null;
  lastUsedStep: number | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const deviceColumns = {
  id: userMfaDevices.id,
  label: userMfaDevices.label,
  secretEnc: userMfaDevices.secretEnc,
  confirmedAt: userMfaDevices.confirmedAt,
  lastUsedStep: userMfaDevices.lastUsedStep,
  lastUsedAt: userMfaDevices.lastUsedAt,
  createdAt: userMfaDevices.createdAt,
};

const lockUser = async (tx: Tx, userId: string): Promise<void> => {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("no key update");
};

const countConfirmed = async (exec: Executor | Tx, userId: string): Promise<number> => {
  const [row] = await exec.select({ n: count() }).from(userMfaDevices).where(and(eq(userMfaDevices.userId, userId), isNotNull(userMfaDevices.confirmedAt)));
  return Number(row?.n ?? 0);
};

/** The confirmed devices, most recently used first (the likeliest match is tried first at sign-in). Never-used ones come last. */
export async function listConfirmedDevices(userId: string, exec: Executor = db): Promise<MfaDevice[]> {
  return exec
    .select(deviceColumns)
    .from(userMfaDevices)
    .where(and(eq(userMfaDevices.userId, userId), isNotNull(userMfaDevices.confirmedAt)))
    .orderBy(sql`${userMfaDevices.lastUsedAt} DESC NULLS LAST`, asc(userMfaDevices.createdAt));
}

/** The login's unfinished enrolment (secret stored, first code not yet entered), if any. */
export async function getPendingDevice(userId: string, exec: Executor = db): Promise<MfaDevice | null> {
  const [row] = await exec.select(deviceColumns).from(userMfaDevices).where(and(eq(userMfaDevices.userId, userId), isNull(userMfaDevices.confirmedAt))).limit(1);
  return row ?? null;
}

/**
 * Starts (or restarts) an enrolment with a fresh sealed secret. An unfinished enrolment is simply replaced (only one can exist);
 * confirmed devices are never touched. "full" when the login already has MAX_DEVICES.
 */
export async function beginEnrollment(userId: string, secretEnc: string, exec: Executor = db): Promise<"started" | "full"> {
  return exec.transaction(async (tx) => {
    await lockUser(tx, userId);
    if ((await countConfirmed(tx, userId)) >= MAX_DEVICES) return "full";
    // The conflict target is the partial unique index (one unfinished enrolment per login); written unqualified to match its predicate exactly.
    await tx
      .insert(userMfaDevices)
      .values({ userId, secretEnc })
      .onConflictDoUpdate({ target: userMfaDevices.userId, targetWhere: sql`confirmed_at IS NULL`, set: { secretEnc, lastUsedStep: null, updatedAt: new Date() } });
    return "started";
  });
}

export type CompleteEnrollment = { ok: true; deviceId: string; first: boolean } | { ok: false; reason: "none_pending" | "full" };

/**
 * Confirms the pending device under the person's own name for it. Recovery codes belong to the login, not to a device, so they are
 * stored ONLY when this is the login's first confirmed device (decided here, inside the transaction); adding a later device leaves
 * the existing ones alone. `first` tells the caller whether the codes it generated were kept and must be shown.
 */
export async function completeEnrollment(userId: string, step: number, label: string, recoveryHashes: string[], exec: Executor = db): Promise<CompleteEnrollment> {
  return exec.transaction(async (tx) => {
    await lockUser(tx, userId);
    const before = await countConfirmed(tx, userId);
    if (before >= MAX_DEVICES) return { ok: false, reason: "full" } as const;
    const now = new Date();
    const [confirmed] = await tx
      .update(userMfaDevices)
      .set({ confirmedAt: now, lastUsedStep: step, label, updatedAt: now })
      .where(and(eq(userMfaDevices.userId, userId), isNull(userMfaDevices.confirmedAt)))
      .returning({ id: userMfaDevices.id });
    if (!confirmed) return { ok: false, reason: "none_pending" } as const;
    const first = before === 0;
    if (first) {
      await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
      if (recoveryHashes.length > 0) await tx.insert(userRecoveryCodes).values(recoveryHashes.map((codeHash) => ({ userId, codeHash })));
    }
    return { ok: true, deviceId: confirmed.id, first } as const;
  });
}

/**
 * Records that a code from this time step was used on this device, and when. False when that step (or a later one) was already
 * used on it: a code works once. ONE conditional UPDATE, so two simultaneous sign-ins with the same code cannot both succeed, and
 * `last_used_at` is written in the same statement (no after-the-response work that a serverless function could cut off).
 */
export async function claimStep(userId: string, deviceId: string, step: number, exec: Executor = db): Promise<boolean> {
  const now = new Date();
  const claimed = await exec
    .update(userMfaDevices)
    .set({ lastUsedStep: step, lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(userMfaDevices.id, deviceId),
        eq(userMfaDevices.userId, userId),
        isNotNull(userMfaDevices.confirmedAt),
        or(isNull(userMfaDevices.lastUsedStep), lt(userMfaDevices.lastUsedStep, step)),
      ),
    )
    .returning({ id: userMfaDevices.id });
  return claimed.length > 0;
}

export type RemoveDevice = { ok: true; label: string } | { ok: false; reason: "not_found" | "last" };

/** Removes one confirmed device of this login. The LAST one is refused: that is turning two-step off (removeMfa), which also clears the recovery codes. */
export async function removeDevice(userId: string, deviceId: string, exec: Executor = db): Promise<RemoveDevice> {
  return exec.transaction(async (tx) => {
    await lockUser(tx, userId);
    const [device] = await tx
      .select({ label: userMfaDevices.label })
      .from(userMfaDevices)
      .where(and(eq(userMfaDevices.id, deviceId), eq(userMfaDevices.userId, userId), isNotNull(userMfaDevices.confirmedAt)))
      .limit(1);
    if (!device) return { ok: false, reason: "not_found" } as const;
    if ((await countConfirmed(tx, userId)) <= 1) return { ok: false, reason: "last" } as const;
    await tx.delete(userMfaDevices).where(and(eq(userMfaDevices.id, deviceId), eq(userMfaDevices.userId, userId)));
    return { ok: true, label: device.label } as const;
  });
}

/** Renames one confirmed device of this login. False when it is not theirs (or is gone). */
export async function renameDevice(userId: string, deviceId: string, label: string, exec: Executor = db): Promise<boolean> {
  const renamed = await exec
    .update(userMfaDevices)
    .set({ label, updatedAt: new Date() })
    .where(and(eq(userMfaDevices.id, deviceId), eq(userMfaDevices.userId, userId), isNotNull(userMfaDevices.confirmedAt)))
    .returning({ id: userMfaDevices.id });
  return renamed.length > 0;
}

/**
 * Turns two-step verification off for this login: every device (also an unfinished enrolment), every recovery code, and the legacy
 * user_mfa row (so re-running the 0008 backfill can never bring this login back). One transaction.
 */
export async function removeMfa(userId: string, exec: Executor = db): Promise<void> {
  await exec.transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
    await tx.delete(userMfaDevices).where(eq(userMfaDevices.userId, userId));
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
  });
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
