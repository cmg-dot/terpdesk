import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { credentials, files } from "@/db/schema";
import type { SelectCredential } from "@/db/schema";
import type { MyCredential } from "@/lib/validation/credential";
import type { CredentialFile } from "@/lib/validation/file";

/**
 * Credential reads shared by the credential server actions.
 * SERVER ONLY: queries the database. Callers must pass the session's own interpreter id.
 */

export const toMyCredential = (row: SelectCredential, files: CredentialFile[] = []): MyCredential => ({
  id: row.id,
  name: row.name,
  type: row.type,
  issuedBy: row.issuedBy ?? "",
  credentialNumber: row.credentialNumber ?? "",
  issueDate: row.issueDate ?? "",
  expirationDate: row.expirationDate ?? "",
  notes: row.notes ?? "",
  isArchived: row.isArchived,
  files,
});

/** Supporting files per credential (newest first). Only ids and display details: never the storage key. */
export async function filesFor(credentialIds: string[]): Promise<Map<string, CredentialFile[]>> {
  const byCredential = new Map<string, CredentialFile[]>();
  if (credentialIds.length === 0) return byCredential;
  const rows = await db
    .select({ id: files.id, credentialId: files.linkedCredentialId, fileName: files.fileName, contentType: files.contentType, sizeBytes: files.sizeBytes })
    .from(files)
    .where(inArray(files.linkedCredentialId, credentialIds))
    .orderBy(desc(files.createdAt));
  for (const r of rows) {
    if (!r.credentialId) continue;
    const list = byCredential.get(r.credentialId) ?? [];
    list.push({ id: r.id, fileName: r.fileName, contentType: r.contentType, sizeBytes: r.sizeBytes });
    byCredential.set(r.credentialId, list);
  }
  return byCredential;
}

/**
 * All of the interpreter's credentials (active and archived), by name, with their files. The dedicated insurance policies
 * (insurance_kind set) are not in this list: the profile shows them in their own sections.
 */
export async function loadCredentials(interpreterId: string): Promise<MyCredential[]> {
  const rows = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.interpreterId, interpreterId), isNull(credentials.insuranceKind)))
    .orderBy(asc(credentials.name));
  const fileMap = await filesFor(rows.map((r) => r.id));
  return rows.map((r) => toMyCredential(r, fileMap.get(r.id) ?? []));
}
