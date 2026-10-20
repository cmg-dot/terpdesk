import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, credentialAgencyShares, credentials, files } from "@/db/schema";
import type { SelectCredential } from "@/db/schema";
import type { CredentialShare, MyCredential } from "@/lib/validation/credential";
import type { CredentialFile } from "@/lib/validation/file";

/**
 * Credential reads shared by the credential server actions.
 * SERVER ONLY: queries the database. Callers must pass the session's own interpreter id.
 */

/** Agencies the interpreter is connected to right now (approved roster rows). Only these can see credentials. */
export async function connectedAgencyIds(interpreterId: string): Promise<string[]> {
  const rows = await db
    .select({ agencyId: agencyInterpreters.agencyId })
    .from(agencyInterpreters)
    .where(and(eq(agencyInterpreters.interpreterId, interpreterId), eq(agencyInterpreters.status, "approved")));
  return rows.map((r) => r.agencyId);
}

export const toMyCredential = (row: SelectCredential, shares: CredentialShare[], files: CredentialFile[] = []): MyCredential => ({
  id: row.id,
  name: row.name,
  type: row.type,
  issuedBy: row.issuedBy ?? "",
  credentialNumber: row.credentialNumber ?? "",
  issueDate: row.issueDate ?? "",
  expirationDate: row.expirationDate ?? "",
  notes: row.notes ?? "",
  shares,
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

/** Shares per credential, keeping only agencies the interpreter is still connected to. */
export async function sharesFor(credentialIds: string[], connected: string[]): Promise<Map<string, CredentialShare[]>> {
  const byCredential = new Map<string, CredentialShare[]>();
  if (credentialIds.length === 0 || connected.length === 0) return byCredential;
  const rows = await db
    .select({
      credentialId: credentialAgencyShares.credentialId,
      agencyId: credentialAgencyShares.agencyId,
      includeFiles: credentialAgencyShares.includeFiles,
    })
    .from(credentialAgencyShares)
    .where(and(inArray(credentialAgencyShares.credentialId, credentialIds), inArray(credentialAgencyShares.agencyId, connected)));
  for (const r of rows) {
    const list = byCredential.get(r.credentialId) ?? [];
    list.push({ agencyId: r.agencyId, includeFiles: r.includeFiles });
    byCredential.set(r.credentialId, list);
  }
  return byCredential;
}

/** All of the interpreter's credentials (active and archived), by name, with their current shares. */
export async function loadCredentials(interpreterId: string): Promise<MyCredential[]> {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.interpreterId, interpreterId))
    .orderBy(asc(credentials.name));
  const ids = rows.map((r) => r.id);
  const shares = await sharesFor(ids, await connectedAgencyIds(interpreterId));
  const fileMap = await filesFor(ids);
  return rows.map((r) => toMyCredential(r, shares.get(r.id) ?? [], fileMap.get(r.id) ?? []));
}
