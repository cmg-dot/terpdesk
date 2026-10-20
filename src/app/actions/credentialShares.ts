"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { credentialAgencyShares, credentials } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { connectedAgencyIds, sharesFor } from "@/lib/credentials";
import { logError } from "@/lib/logError";
import type { CredentialShare } from "@/lib/validation/credential";

export type SetCredentialShareResult = { success: true; shares: CredentialShare[] } | { success: false; error: string };

const shareSchema = z.object({
  credentialId: z.string().uuid(),
  agencyId: z.string().trim().min(1).max(100),
  shared: z.boolean(),
  includeFiles: z.boolean(),
});

/** Agencies the signed-in interpreter can share credentials with (the ones they are connected to). */
export async function getShareableAgencyIds(): Promise<string[]> {
  const { interpreterId } = await requireInterpreter();
  return connectedAgencyIds(interpreterId);
}

/**
 * Shares one of the interpreter's own credentials with one agency they are connected to, changes whether its
 * files are included, or stops sharing it. Returns the credential's shares as now stored.
 */
export async function setCredentialShare(input: z.input<typeof shareSchema>): Promise<SetCredentialShareResult> {
  let session;
  let interpreterId: string;
  try {
    ({ session, interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: "Connect your interpreter profile before sharing credentials." };
  }

  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { credentialId, agencyId, shared } = parsed.data;
  // Files can only travel with a shared credential.
  const includeFiles = shared && parsed.data.includeFiles;

  try {
    await ensureAvailabilityTables();

    // The credential must be the interpreter's own and active; the agency must be one they are connected to.
    const [own] = await db
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.id, credentialId), eq(credentials.interpreterId, interpreterId), eq(credentials.isArchived, false)))
      .limit(1);
    if (!own) return { success: false, error: "This credential was not found. It may have been archived." };

    const connected = await connectedAgencyIds(interpreterId);
    if (shared && !connected.includes(agencyId)) {
      return { success: false, error: "You can only share with agencies you are connected to." };
    }

    if (shared) {
      await db
        .insert(credentialAgencyShares)
        .values({ credentialId, agencyId, includeFiles })
        .onConflictDoUpdate({
          target: [credentialAgencyShares.credentialId, credentialAgencyShares.agencyId],
          set: { includeFiles },
        });
    } else {
      await db
        .delete(credentialAgencyShares)
        .where(and(eq(credentialAgencyShares.credentialId, credentialId), eq(credentialAgencyShares.agencyId, agencyId)));
    }

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: shared ? "credential_shared" : "credential_unshared",
      details: `credentialId=${credentialId}; agencyId=${agencyId}; includeFiles=${includeFiles}`,
    });

    const shares = await sharesFor([credentialId], connected);
    return { success: true, shares: shares.get(credentialId) ?? [] };
  } catch (err) {
    logError("setCredentialShare", err);
    return { success: false, error: "We could not update who can see this credential. Please try again." };
  }
}
