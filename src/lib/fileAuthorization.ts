import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/db";
import { agencyInterpreters, credentialAgencyShares, credentials } from "@/db/schema";
import type { SelectFile } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { bookedRequestIds } from "@/lib/prepAccess";

/**
 * The single rule for "may this signed-in person open this file?". The file route, the download action and the
 * agency views all call it, so the rules cannot drift apart. What a file is follows from how it is linked:
 *
 *  - linked to a job (prep material): agency staff of the uploading agency; an interpreter only if the agency
 *    shared it with interpreters AND they are booked on that job.
 *  - linked to a credential (supporting file): the interpreter who owns it; agency staff only while the credential
 *    is active, shared with the agency WITH supporting files included, and the interpreter is still connected.
 *  - neither, uploaded by an interpreter (profile photo): that interpreter; agency staff of an agency the
 *    interpreter is connected to.
 *
 * SERVER ONLY: queries the database.
 */

const connectedTo = async (agencyId: string, interpreterId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: agencyInterpreters.id })
    .from(agencyInterpreters)
    .where(
      and(
        eq(agencyInterpreters.agencyId, agencyId),
        eq(agencyInterpreters.interpreterId, interpreterId),
        eq(agencyInterpreters.status, "approved"),
      ),
    )
    .limit(1);
  return Boolean(row);
};

export const isProfilePhoto = (file: SelectFile): boolean =>
  !file.linkedJobId && !file.linkedCredentialId && Boolean(file.uploadedByInterpreterId);

export async function canViewFile(session: Session, file: SelectFile): Promise<boolean> {
  const isAgency = session.user.role === "agency";
  const interpreterId = session.user.role === "interpreter" ? session.user.interpreterId : null;

  if (file.linkedJobId) {
    if (isAgency) return file.uploadedByAgencyId === DEFAULT_AGENCY_ID;
    if (!interpreterId || !file.sharedWithInterpreters) return false;
    return (await bookedRequestIds(interpreterId)).includes(file.linkedJobId);
  }

  if (file.linkedCredentialId) {
    const [credential] = await db
      .select({ interpreterId: credentials.interpreterId, isArchived: credentials.isArchived })
      .from(credentials)
      .where(eq(credentials.id, file.linkedCredentialId))
      .limit(1);
    if (!credential) return false;
    if (interpreterId) return credential.interpreterId === interpreterId;
    if (!isAgency || credential.isArchived) return false;

    const [share] = await db
      .select({ includeFiles: credentialAgencyShares.includeFiles })
      .from(credentialAgencyShares)
      .where(and(eq(credentialAgencyShares.credentialId, file.linkedCredentialId), eq(credentialAgencyShares.agencyId, DEFAULT_AGENCY_ID)))
      .limit(1);
    return Boolean(share?.includeFiles) && (await connectedTo(DEFAULT_AGENCY_ID, credential.interpreterId));
  }

  if (isProfilePhoto(file) && file.uploadedByInterpreterId) {
    if (interpreterId) return file.uploadedByInterpreterId === interpreterId;
    return isAgency && (await connectedTo(DEFAULT_AGENCY_ID, file.uploadedByInterpreterId));
  }

  return false;
}
