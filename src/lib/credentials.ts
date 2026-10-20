import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agencyInterpreters, credentialAgencyShares, credentials } from "@/db/schema";
import type { SelectCredential } from "@/db/schema";
import type { CredentialShare, MyCredential } from "@/lib/validation/credential";

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

export const toMyCredential = (row: SelectCredential, shares: CredentialShare[]): MyCredential => ({
  id: row.id,
  name: row.name,
  type: row.type,
  issuedBy: row.issuedBy ?? "",
  credentialNumber: row.credentialNumber ?? "",
  issueDate: row.issueDate ?? "",
  expirationDate: row.expirationDate ?? "",
  notes: row.notes ?? "",
  shares,
});

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

/** The interpreter's active (not archived) credentials, by name, with their current shares. */
export async function loadCredentials(interpreterId: string): Promise<MyCredential[]> {
  const rows = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false)))
    .orderBy(asc(credentials.name));
  const shares = await sharesFor(rows.map((r) => r.id), await connectedAgencyIds(interpreterId));
  return rows.map((r) => toMyCredential(r, shares.get(r.id) ?? []));
}
