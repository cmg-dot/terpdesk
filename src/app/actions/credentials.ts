"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { connectedAgencyIds, loadCredentials, sharesFor, toMyCredential } from "@/lib/credentials";
import { logError } from "@/lib/logError";
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

/** The signed-in interpreter's active credentials with their shares. Never accepts an id from the browser. */
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
    return { success: true, credential: toMyCredential(updated, shares.get(updated.id) ?? []) };
  } catch (err) {
    logError("updateCredential", err);
    return { success: false, error: "We could not save this credential. Please try again." };
  }
}

/** Soft delete: hides the credential from the profile and from every agency, but keeps the record. */
export async function archiveCredential(idInput: string): Promise<ArchiveCredentialResult> {
  const me = await sessionInterpreter();
  if (!me) return { success: false, error: NOT_LINKED };
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    const archived = await db
      .update(credentials)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(credentials.id, id.data), eq(credentials.interpreterId, me.interpreterId), eq(credentials.isArchived, false)))
      .returning({ id: credentials.id });
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
