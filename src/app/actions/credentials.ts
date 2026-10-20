"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credentialAgencyShares, credentials, files } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { connectedAgencyIds, filesFor, loadCredentials, sharesFor, toMyCredential } from "@/lib/credentials";
import { logError } from "@/lib/logError";
import { removeObjectsQuietly } from "@/lib/s3";
import { credentialSchema } from "@/lib/validation/credential";
import type { CredentialField, CredentialInput, MyCredential } from "@/lib/validation/credential";

type FieldErrors = Partial<Record<CredentialField, string>>;

export type SaveCredentialResult =
  | { success: true; credential: MyCredential }
  | { success: false; error: string; fieldErrors?: FieldErrors };

export type ArchiveCredentialResult = { success: true } | { success: false; error: string };

const MAX_CREDENTIALS = 50;
const idSchema = z.string().uuid();
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before adding credentials.";

const sessionInterpreter = async () => {
  try {
    const { session, interpreterId } = await requireInterpreter();
    return { session, interpreterId };
  } catch {
    return null;
  }
};

const parseCredential = (input: CredentialInput) => {
  const parsed = credentialSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as CredentialField | undefined;
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { ok: false as const, result: { success: false as const, error: "Please fix the highlighted fields.", fieldErrors } };
};

/** Only validated, picked fields reach the database. Empty strings are stored as "not set". */
const toColumns = (d: z.output<typeof credentialSchema>) => ({
  name: d.name,
  type: d.type,
  issuedBy: d.issuedBy || null,
  credentialNumber: d.credentialNumber || null,
  issueDate: d.issueDate || null,
  expirationDate: d.expirationDate || null,
  notes: d.notes || null,
});

/** The signed-in interpreter's credentials (active and archived) with shares. Never accepts an id from the browser. */
export async function getCredentials(): Promise<MyCredential[]> {
  const { interpreterId } = await requireInterpreter();
  await ensureAvailabilityTables();
  return loadCredentials(interpreterId);
}

/** Adds a credential to the signed-in interpreter's profile. New credentials are visible only to them. */
export async function addCredential(input: CredentialInput): Promise<SaveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const parsed = parseCredential(input);
  if (!parsed.ok) return parsed.result;

  try {
    await ensureAvailabilityTables();
    const [existing] = await db
      .select({ total: count() })
      .from(credentials)
      .where(and(eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, false)));
    if (Number(existing?.total ?? 0) >= MAX_CREDENTIALS) {
      return { success: false, error: `You can list up to ${MAX_CREDENTIALS} credentials. Archive one to add another.` };
    }

    const [created] = await db
      .insert(credentials)
      .values({ interpreterId: me.interpreterId, ...toColumns(parsed.data) })
      .returning();

    // Identifiers only: the credential's name and number are not written to the audit trail.
    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_added",
      details: `credentialId=${created.id}; type=${created.type}`,
    });
    return { success: true, credential: toMyCredential(created, []) };
  } catch (err) {
    logError("addCredential", err);
    return { success: false, error: "We could not save this credential. Please try again." };
  }
}

/** Edits one of the signed-in interpreter's own (active) credentials. Sharing is left as it was. */
export async function updateCredential(idInput: string, input: CredentialInput): Promise<SaveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { success: false, error: "Invalid request." };
  const parsed = parseCredential(input);
  if (!parsed.ok) return parsed.result;

  try {
    await ensureAvailabilityTables();
    const [updated] = await db
      .update(credentials)
      .set({ ...toColumns(parsed.data), updatedAt: new Date() })
      .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, false)))
      .returning();
    if (!updated) return { success: false, error: "This credential was not found. It may have been archived." };

    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_updated",
      details: `credentialId=${updated.id}`,
    });
    const shares = await sharesFor([updated.id], await connectedAgencyIds(me.interpreterId));
    const attached = await filesFor([updated.id]);
    return { success: true, credential: toMyCredential(updated, shares.get(updated.id) ?? [], attached.get(updated.id) ?? []) };
  } catch (err) {
    logError("updateCredential", err);
    return { success: false, error: "We could not save this credential. Please try again." };
  }
}

/**
 * Soft delete: hides the credential from the profile and from every agency, but keeps the record.
 * Agency shares are cleared too, so reactivating it later never re-exposes it without the interpreter choosing to.
 */
export async function archiveCredential(idInput: string): Promise<ArchiveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    const archived = await db.transaction(async (tx) => {
      const rows = await tx
        .update(credentials)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, false)))
        .returning({ id: credentials.id });
      if (rows.length > 0) await tx.delete(credentialAgencyShares).where(eq(credentialAgencyShares.credentialId, id.data));
      return rows;
    });
    if (archived.length === 0) return { success: false, error: "This credential was not found. It may already be archived." };

    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_archived",
      details: `credentialId=${id.data}`,
    });
    return { success: true };
  } catch (err) {
    logError("archiveCredential", err);
    return { success: false, error: "We could not archive this credential. Please try again." };
  }
}

/** Brings an archived credential back to the active list. It starts private (only the interpreter sees it). */
export async function reactivateCredential(idInput: string): Promise<SaveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    const [active] = await db
      .select({ total: count() })
      .from(credentials)
      .where(and(eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, false)));
    if (Number(active?.total ?? 0) >= MAX_CREDENTIALS) {
      return { success: false, error: `You can list up to ${MAX_CREDENTIALS} credentials. Archive one to reactivate this one.` };
    }

    const [restored] = await db
      .update(credentials)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, true)))
      .returning();
    if (!restored) return { success: false, error: "This credential was not found. It may already be active." };

    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_reactivated",
      details: `credentialId=${restored.id}`,
    });
    const attached = await filesFor([restored.id]);
    return { success: true, credential: toMyCredential(restored, [], attached.get(restored.id) ?? []) };
  } catch (err) {
    logError("reactivateCredential", err);
    return { success: false, error: "We could not reactivate this credential. Please try again." };
  }
}

/**
 * Permanently removes a credential (and, through the database cascade, its agency shares). This cannot be undone,
 * so only archived credentials qualify: an active one must be archived first.
 */
export async function deleteCredentialPermanently(idInput: string): Promise<ArchiveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    // Remember the stored files first: the database removes their rows with the credential, S3 does not.
    const [owned] = await db
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, true)))
      .limit(1);
    const storedKeys = owned
      ? (await db.select({ key: files.storageKey }).from(files).where(eq(files.linkedCredentialId, owned.id))).map((f) => f.key)
      : [];

    const removed = await db
      .delete(credentials)
      .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, true)))
      .returning({ id: credentials.id });
    if (removed.length === 0) {
      return { success: false, error: "Only archived credentials can be deleted. Archive it first, or it may already be gone." };
    }
    await removeObjectsQuietly(storedKeys);

    await writeAuditLog({
      userId: me.session.user.id,
      userEmail: me.session.user.email ?? null,
      action: "credential_deleted_permanently",
      details: `credentialId=${id.data}`,
    });
    return { success: true };
  } catch (err) {
    logError("deleteCredentialPermanently", err);
    return { success: false, error: "We could not delete this credential. Please try again." };
  }
}
