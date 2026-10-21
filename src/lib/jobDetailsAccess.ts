import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, offers, requests } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { verifyJobDetailsToken } from "@/lib/jobDetailsToken";
import { jobDetailsFor } from "@/lib/jobSummary";
import type { JobDetails } from "@/lib/jobSummary";
import { bookedRequestIds } from "@/lib/prepAccess";

export type JobDetailsAccess =
  | { ok: true; requestId: string; interpreterId: string; details: JobDetails; files: { id: string; fileName: string; sizeBytes: number }[] }
  | { ok: false; reason: "invalid" | "not_booked" };

/**
 * Resolves a job-details link. The signature alone is not enough: the interpreter must still be booked on the job
 * (and the job not cancelled) at the moment the page or a file is opened, so removing them switches the link off.
 *
 * SERVER ONLY.
 */
export async function resolveJobDetailsLink(token: string): Promise<JobDetailsAccess> {
  const payload = verifyJobDetailsToken(token);
  if (!payload) return { ok: false, reason: "invalid" };
  await ensureAvailabilityTables();

  if (!(await bookedRequestIds(payload.interpreterId)).includes(payload.requestId)) return { ok: false, reason: "not_booked" };

  const [request] = await db
    .select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
    .from(requests)
    .where(eq(requests.id, payload.requestId))
    .limit(1);
  if (!request) return { ok: false, reason: "not_booked" };

  // Which position they hold (for the "Role" line), from their accepted offer.
  const [offer] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.requestId, request.id), eq(offers.interpreterId, payload.interpreterId), eq(offers.status, "accepted")))
    .orderBy(desc(offers.updatedAt))
    .limit(1);
  const offerPositions = ((request.data ?? {}) as { offerPositions?: Record<string, number> }).offerPositions ?? {};
  const positionNumber = offer ? offerPositions[offer.id] ?? 1 : undefined;

  const shared = await db
    .select({ id: files.id, fileName: files.fileName, sizeBytes: files.sizeBytes })
    .from(files)
    .where(and(eq(files.linkedJobId, request.id), eq(files.sharedWithInterpreters, true)))
    .orderBy(desc(files.createdAt));

  return {
    ok: true,
    requestId: request.id,
    interpreterId: payload.interpreterId,
    details: jobDetailsFor(request, positionNumber),
    files: shared,
  };
}
