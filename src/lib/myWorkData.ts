import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreterProfiles } from "@/db/schema";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import type { PersonalJobView } from "@/lib/personalJobs";
import { readPersonalJobs } from "@/lib/personalJobsStore";
import { getIanaZone } from "@/utils/timezone";

/**
 * What the My work page needs, for the signed-in interpreter only (plain server code, called by the page).
 *  - "ok": their personal jobs and the time zone to start a new job in (their profile's, else Pacific);
 *  - "not_ready": the table from migration 0014 is not on this database yet, so the page says so instead of failing;
 *  - "not_linked": the login is not linked to an interpreter profile yet;
 *  - "error": anything else (logged by code only; nothing the interpreter typed is printed).
 */
export type MyWorkData =
  | { status: "ok"; jobs: PersonalJobView[]; timeZone: string; generatedAt: string }
  | { status: "not_ready" | "not_linked" | "error" };

export async function loadMyWork(): Promise<MyWorkData> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { status: "not_linked" };
  }
  try {
    const [jobs, [profile]] = await Promise.all([
      readPersonalJobs(interpreterId),
      db.select({ timeZone: interpreterProfiles.timeZone }).from(interpreterProfiles).where(eq(interpreterProfiles.interpreterId, interpreterId)).limit(1),
    ]);
    return { status: "ok", jobs, timeZone: getIanaZone(profile?.timeZone ?? "America/Los_Angeles"), generatedAt: new Date().toISOString() };
  } catch (err) {
    if (isMissingTable(err)) return { status: "not_ready" };
    logError("loadMyWork", err);
    return { status: "error" };
  }
}
