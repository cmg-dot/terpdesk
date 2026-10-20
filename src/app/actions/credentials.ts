"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import type { SelectCredential } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { credentialSchema } from "@/lib/validation/credential";
import type { CredentialField, CredentialInput, MyCredential } from "@/lib/validation/credential";

export type AddCredentialResult =
  | { success: true; credential: MyCredential }
  | { success: false; error: string; fieldErrors?: Partial<Record<CredentialField, string>> };

export type DeleteCredentialResult = { success: true } | { success: false; error: string };

const MAX_CREDENTIALS = 50;
const idSchema = z.string().uuid();
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before adding credentials.";

const toMyCredential = (row: SelectCredential): MyCredential => ({
  id: row.id,
  name: row.name,
  type: row.type,
  issuedBy: row.issuedBy ?? "",
  credentialNumber: row.credentialNumber ?? "",
  issueDate: row.issueDate ?? "",
  expirationDate: row.expirationDate ?? "",
  notes: row.notes ?? "",
});

/** The signed-in interpreter's own credentials, by name. Never accepts an id from the browser. */
export async function getCredentials(): Promise<MyCredential[]> {
  const { interpreterId } = await requireInterpreter();
  await ensureAvailabilityTables();
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.interpreterId, interpreterId))
    .orderBy(asc(credentials.name));
  return rows.map(toMyCredential);
}

/** Adds a credential to the signed-in interpreter's profile. */
export async function addCredential(input: CredentialInput): Promise<AddCredentialResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_LINKED };
  }

  const parsed = credentialSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<CredentialField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as CredentialField | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;

  try {
    await ensureAvailabilityTables();
    const [existing] = await db.select({ total: count() }).from(credentials).where(eq(credentials.interpreterId, interpreterId));
    if (Number(existing?.total ?? 0) >= MAX_CREDENTIALS) {
      return { success: false, error: `You can list up to ${MAX_CREDENTIALS} credentials. Delete one to add another.` };
    }

    // Only validated, picked fields reach the database. Empty strings are stored as "not set".
    const [created] = await db
      .insert(credentials)
      .values({
        interpreterId,
        name: d.name,
        type: d.type,
        issuedBy: d.issuedBy || null,
        credentialNumber: d.credentialNumber || null,
        issueDate: d.issueDate || null,
        expirationDate: d.expirationDate || null,
        notes: d.notes || null,
      })
      .returning();

    // Identifiers only: the credential's name and number are not written to the audit trail.
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "credential_added",
      details: `credentialId=${created.id}; type=${created.type}`,
    });
    return { success: true, credential: toMyCredential(created) };
  } catch (err) {
    logError("addCredential", err);
    return { success: false, error: "We could not save this credential. Please try again." };
  }
}

/** Deletes one of the signed-in interpreter's own credentials. Someone else's id matches nothing. */
export async function deleteCredential(idInput: string): Promise<DeleteCredentialResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: NOT_LINKED };
  }

  const parsed = idSchema.safeParse(idInput);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  try {
    await ensureAvailabilityTables();
    const removed = await db
      .delete(credentials)
      .where(and(eq(credentials.id, parsed.data), eq(credentials.interpreterId, interpreterId)))
      .returning({ id: credentials.id });
    if (removed.length === 0) return { success: false, error: "This credential was not found. It may already be deleted." };

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "credential_deleted",
      details: `credentialId=${parsed.data}`,
    });
    return { success: true };
  } catch (err) {
    logError("deleteCredential", err);
    return { success: false, error: "We could not delete this credential. Please try again." };
  }
}
