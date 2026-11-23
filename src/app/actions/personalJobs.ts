"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { interpreterPersonalJobs } from "@/db/personalJobsSchema";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { toPersonalJobView } from "@/lib/personalJobs";
import type { PersonalJobView } from "@/lib/personalJobs";
import { readPersonalJobs } from "@/lib/personalJobsStore";
import { MAX_PERSONAL_JOBS, parsePersonalJob } from "@/lib/validation/personalJob";
import type { PersonalJobField, PersonalJobInput } from "@/lib/validation/personalJob";

/**
 * An interpreter's own personal jobs (jobs done outside any agency). Every action starts with requireInterpreter() and works only on
 * rows where interpreter_id is the signed-in interpreter's own: an id from the browser never widens that. The audit log gets the
 * action and the job's id, never the label or anything else the interpreter typed.
 */

export type SavePersonalJobResult =
  | { success: true; job: PersonalJobView }
  | { success: false; error: string; fieldErrors?: Partial<Record<PersonalJobField, string>> };
export type DeletePersonalJobResult = { success: true } | { success: false; error: string };

const idSchema = z.string().uuid();
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before logging personal jobs.";
const NOT_FOUND = "That personal job could not be found.";
const TOO_MANY = `You have reached the limit of ${MAX_PERSONAL_JOBS.toLocaleString("en-US")} personal jobs. Delete some to add more.`;
const GENERIC_FAILURE = "We could not save that. Please try again.";

const me = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

const refresh = () => {
  revalidatePath("/my-work");
  revalidatePath("/interpreter-calendar");
  revalidatePath("/interpreter-home");
};

/** The signed-in interpreter's personal jobs, newest first (at most the cap). */
export async function listMyPersonalJobs(): Promise<PersonalJobView[]> {
  const { interpreterId } = await requireInterpreter();
  return readPersonalJobs(interpreterId);
}

/** Adds a personal job, or updates one of the interpreter's own when `id` is given. */
export async function savePersonalJob(input: PersonalJobInput & { id?: string }): Promise<SavePersonalJobResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const { interpreterId, session } = own;

  const parsed = parsePersonalJob(input);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  const values = {
    label: parsed.data.label,
    setting: parsed.data.setting,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    timeZone: parsed.data.timeZone,
    breakMinutes: parsed.data.breakMinutes,
    miles: parsed.data.miles === null ? null : String(parsed.data.miles),
    roundTrip: parsed.data.roundTrip,
    countedMiles: parsed.data.countedMiles === null ? null : String(parsed.data.countedMiles),
  };

  try {
    let saved;
    if (input.id !== undefined) {
      if (!idSchema.safeParse(input.id).success) return { success: false, error: NOT_FOUND };
      [saved] = await db
        .update(interpreterPersonalJobs)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(interpreterPersonalJobs.id, input.id), eq(interpreterPersonalJobs.interpreterId, interpreterId)))
        .returning();
      if (!saved) return { success: false, error: NOT_FOUND };
    } else {
      const [row] = await db
        .select({ total: count() })
        .from(interpreterPersonalJobs)
        .where(eq(interpreterPersonalJobs.interpreterId, interpreterId));
      if (Number(row?.total ?? 0) >= MAX_PERSONAL_JOBS) return { success: false, error: TOO_MANY };
      [saved] = await db.insert(interpreterPersonalJobs).values({ interpreterId, ...values }).returning();
      if (!saved) return { success: false, error: GENERIC_FAILURE };
    }
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: input.id !== undefined ? "personal_job_updated" : "personal_job_created",
      details: `jobId=${saved.id}`,
    });
    refresh();
    return { success: true, job: toPersonalJobView(saved) };
  } catch (err) {
    logError("savePersonalJob", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/** Deletes one of the interpreter's own personal jobs. Another interpreter's id, or an unknown one, is "not found". */
export async function deletePersonalJob(id: string): Promise<DeletePersonalJobResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!idSchema.safeParse(id).success) return { success: false, error: NOT_FOUND };
  try {
    const removed = await db
      .delete(interpreterPersonalJobs)
      .where(and(eq(interpreterPersonalJobs.id, id), eq(interpreterPersonalJobs.interpreterId, own.interpreterId)))
      .returning({ id: interpreterPersonalJobs.id });
    if (removed.length === 0) return { success: false, error: NOT_FOUND };
    await writeAuditLog({
      userId: own.session.user.id,
      userEmail: own.session.user.email ?? null,
      action: "personal_job_deleted",
      details: `jobId=${id}`,
    });
    refresh();
    return { success: true };
  } catch (err) {
    logError("deletePersonalJob", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}
