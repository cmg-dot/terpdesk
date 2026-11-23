import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreterPersonalJobs } from "@/db/personalJobsSchema";
import { toPersonalJobView } from "@/lib/personalJobs";
import type { PersonalJobView } from "@/lib/personalJobs";
import { MAX_PERSONAL_JOBS } from "@/lib/validation/personalJob";

/**
 * Plain server code (not a Server Action): the one read of an interpreter's personal jobs, shared by the list action, the My work
 * page and the CSV export. It is scoped to the interpreter id its CALLER took from the session (requireInterpreter), never from the
 * browser: every caller passes `interpreterId` from there.
 */
export async function readPersonalJobs(interpreterId: string): Promise<PersonalJobView[]> {
  const rows = await db
    .select()
    .from(interpreterPersonalJobs)
    .where(eq(interpreterPersonalJobs.interpreterId, interpreterId))
    .orderBy(desc(interpreterPersonalJobs.startsAt))
    .limit(MAX_PERSONAL_JOBS);
  return rows.map(toPersonalJobView);
}
