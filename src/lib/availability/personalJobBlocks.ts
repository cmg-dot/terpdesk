import { and, desc, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { interpreterPersonalJobs } from "@/db/personalJobsSchema";
import { isUuid } from "@/lib/availability/ids";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { MAX_PERSONAL_JOBS } from "@/lib/validation/personalJob";

/**
 * Reads of personal jobs for screens that DRAW them (plain server code, not Server Actions). Two readers, on purpose:
 *  - ownPersonalJobsFor: the interpreter's own calendar, which may show the label and setting (it is their own data);
 *  - personalJobWindowsFor: anything an agency sees, which gets only who and when. The label and setting are never selected,
 *    so they cannot reach an agency by mistake.
 * The table comes from migration 0014: until it is applied, a missing table (Postgres 42P01) means none.
 */

export interface PersonalJobWindow {
  interpreterId: string;
  startsAt: Date;
  endsAt: Date;
}

/** Bare start and end times of personal jobs touching [from, to], for the given interpreters. Mock (non-UUID) ids are skipped. */
export async function personalJobWindowsFor(interpreterIds: readonly string[], from: Date, to: Date): Promise<PersonalJobWindow[]> {
  const ids = interpreterIds.filter(isUuid);
  if (ids.length === 0) return [];
  try {
    return await db
      .select({ interpreterId: interpreterPersonalJobs.interpreterId, startsAt: interpreterPersonalJobs.startsAt, endsAt: interpreterPersonalJobs.endsAt })
      .from(interpreterPersonalJobs)
      .where(and(inArray(interpreterPersonalJobs.interpreterId, ids), gt(interpreterPersonalJobs.endsAt, from), lt(interpreterPersonalJobs.startsAt, to)));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

export interface OwnPersonalJobBlock {
  id: string;
  label: string;
  setting: string;
  /** ISO (UTC). */
  startsAt: string;
  endsAt: string;
  timeZone: string;
}

/** The interpreter's own personal jobs, for drawing on their own calendar (newest first, at most the cap). */
export async function ownPersonalJobsFor(interpreterIds: readonly string[]): Promise<OwnPersonalJobBlock[]> {
  const ids = interpreterIds.filter(isUuid);
  if (ids.length === 0) return [];
  try {
    const rows = await db
      .select({
        id: interpreterPersonalJobs.id,
        label: interpreterPersonalJobs.label,
        setting: interpreterPersonalJobs.setting,
        startsAt: interpreterPersonalJobs.startsAt,
        endsAt: interpreterPersonalJobs.endsAt,
        timeZone: interpreterPersonalJobs.timeZone,
      })
      .from(interpreterPersonalJobs)
      .where(inArray(interpreterPersonalJobs.interpreterId, ids))
      .orderBy(desc(interpreterPersonalJobs.startsAt))
      .limit(MAX_PERSONAL_JOBS);
    return rows.map((r) => ({
      id: r.id,
      label: r.label ?? "",
      setting: r.setting ?? "",
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      timeZone: r.timeZone,
    }));
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}
