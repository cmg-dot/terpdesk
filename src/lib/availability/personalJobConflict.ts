import { gt, inArray, lt, and } from "drizzle-orm";
import { db } from "@/db";
import { interpreterPersonalJobs } from "@/db/personalJobsSchema";

/**
 * Does an interpreter have a personal job (work done outside any agency) overlapping a window? Plain server code, called by td_conflict.
 *
 * Only the id is read: the label is private and never leaves the interpreter's own pages. Overlap is strict on both ends (a job that
 * ends exactly when the window starts, or starts exactly when it ends, does not overlap).
 *
 * The table comes from migration 0014. Until that is applied, "relation does not exist" (Postgres 42P01) means there are no personal
 * jobs, so a deploy that runs before the SQL cannot make every acceptance fail. ANY OTHER error is thrown on purpose: td_conflict
 * treats an unreadable schedule as a conflict (it fails closed) rather than call an interpreter free when it cannot tell.
 */

interface PgErrorLike {
  code?: string;
  cause?: unknown;
}

/** True for Postgres "undefined_table", which Drizzle reports on the error itself or on its `cause`. */
export function isMissingTable(err: unknown): boolean {
  const e = err as PgErrorLike | null;
  if (!e || typeof e !== "object") return false;
  if (e.code === "42P01") return true;
  const cause = e.cause as PgErrorLike | null | undefined;
  return Boolean(cause && typeof cause === "object" && cause.code === "42P01");
}

let reportedMissing = false;

export async function hasPersonalJobConflict(interpreterIds: readonly string[], startsAt: Date, endsAt: Date): Promise<boolean> {
  if (interpreterIds.length === 0) return false;
  try {
    const rows = await db
      .select({ id: interpreterPersonalJobs.id })
      .from(interpreterPersonalJobs)
      .where(
        and(
          inArray(interpreterPersonalJobs.interpreterId, [...interpreterIds]),
          lt(interpreterPersonalJobs.startsAt, endsAt),
          gt(interpreterPersonalJobs.endsAt, startsAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    if (!reportedMissing) {
      reportedMissing = true;
      console.error("[availability] interpreter_personal_jobs does not exist yet; personal jobs are not counted until migration 0014 is applied");
    }
    return false;
  }
}
