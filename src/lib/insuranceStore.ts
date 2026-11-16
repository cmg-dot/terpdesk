import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { credentials, interpreterProfiles } from "@/db/schema";
import { filesFor } from "@/lib/credentials";
import { isInsuranceKind } from "@/lib/insurance";
import type { InsurancePolicy, MyInsurance } from "@/lib/insurance";
import { getIanaZone } from "@/utils/timezone";

/** Reads of the dedicated insurance policies (lib/insurance.ts). SERVER ONLY: queries the database. */

/** The interpreter's active Liability and Commercial Auto policies, with their files. */
export async function loadInsurance(interpreterId: string): Promise<MyInsurance> {
  const rows = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false), isNotNull(credentials.insuranceKind)));
  const fileMap = await filesFor(rows.map((r) => r.id));
  const result: MyInsurance = { liability: null, commercial_auto: null };
  for (const r of rows) {
    if (!isInsuranceKind(r.insuranceKind)) continue;
    const policy: InsurancePolicy = {
      credentialId: r.id,
      kind: r.insuranceKind,
      insurer: r.issuedBy ?? "",
      policyNumber: r.credentialNumber ?? "",
      coverageLimits: r.coverageLimits ?? "",
      expirationDate: r.expirationDate ?? "",
      files: fileMap.get(r.id) ?? [],
    };
    result[r.insuranceKind] = policy;
  }
  return result;
}

/** The interpreter's own time zone (the profile's), for judging expiry. */
export async function interpreterZone(interpreterId: string): Promise<string> {
  const [row] = await db.select({ timeZone: interpreterProfiles.timeZone }).from(interpreterProfiles).where(eq(interpreterProfiles.interpreterId, interpreterId)).limit(1);
  return getIanaZone(row?.timeZone ?? "America/Los_Angeles");
}

/** Interpreter id -> their active commercial auto policy's expiration date (yyyy-MM-dd), for the +$10 badge. */
export async function commercialAutoExpirations(interpreterIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(interpreterIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const rows = await db
    .select({ interpreterId: credentials.interpreterId, expirationDate: credentials.expirationDate })
    .from(credentials)
    .where(and(inArray(credentials.interpreterId, ids), eq(credentials.isArchived, false), eq(credentials.insuranceKind, "commercial_auto")));
  for (const r of rows) if (r.expirationDate) out.set(r.interpreterId, r.expirationDate);
  return out;
}
