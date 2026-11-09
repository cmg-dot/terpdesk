"use server";

import { and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { offers, requests } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { loadRosterCandidates } from "@/lib/jobImport/roster";
import { logError } from "@/lib/logError";
import { liveEffects } from "@/lib/serviceVerification";
import { assignPendingVerification } from "@/lib/verificationAssignment";
import { PENDING_REASON_TEXT, suggestedIds } from "@/lib/verificationPending";
import type { PendingVerification, PendingVerificationView } from "@/lib/verificationPending";
import { requestReference } from "@/utils/statusEngine";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

/**
 * Hours review's "Needs matching to an interpreter" list: service-verification reports that arrived for a job with nobody booked, or
 * with two interpreters and no name that fits. Agency staff only. Reading changes nothing.
 */
export async function getPendingVerifications(): Promise<PendingVerificationView[]> {
  await requireRole("agency");
  const rows = await db
    .select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
    .from(requests)
    .where(and(isNull(requests.canceledAt), sql`jsonb_array_length(coalesce(${requests.data} -> 'pendingVerifications', '[]'::jsonb)) > 0`));
  if (rows.length === 0) return [];

  const [roster, booked] = await Promise.all([
    loadRosterCandidates(DEFAULT_AGENCY_ID),
    db.select({ requestId: offers.requestId, interpreterId: offers.interpreterId }).from(offers).where(and(inArray(offers.requestId, rows.map((r) => r.id)), sql`${offers.status} = 'accepted'`)),
  ]);
  const bookedBy = new Map<string, Set<string>>();
  for (const b of booked) bookedBy.set(b.requestId, (bookedBy.get(b.requestId) ?? new Set<string>()).add(b.interpreterId));

  const views: PendingVerificationView[] = [];
  for (const row of rows) {
    const data = (row.data ?? {}) as unknown as { pendingVerifications?: PendingVerification[]; intake?: { odhhSrn?: string }; details?: { timeZone?: string; timezone?: string } };
    const { startsAt, endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
    const bookedIds = bookedBy.get(row.id) ?? new Set<string>();
    for (const p of data.pendingVerifications ?? []) {
      const fits = new Set(suggestedIds(roster, p.reportInterpreter.name));
      const candidates = roster
        .map((r) => ({ id: r.id, label: r.label, booked: bookedIds.has(r.id), suggested: fits.has(r.id) }))
        .sort((a, b) => Number(b.suggested) - Number(a.suggested) || Number(b.booked) - Number(a.booked) || a.label.localeCompare(b.label));
      const onlyFit = candidates.filter((c) => c.suggested);
      const onlyBooked = candidates.filter((c) => c.booked);
      views.push({
        requestId: row.id,
        reportId: p.id,
        title: row.title,
        reference: requestReference(data.intake?.odhhSrn, row.id),
        scheduledStart: startsAt,
        scheduledEnd: endsAt,
        timeZone: getIanaZone(data.details?.timeZone ?? data.details?.timezone),
        receivedAt: p.receivedAt,
        reason: p.reason,
        reasonText: PENDING_REASON_TEXT[p.reason],
        reportInterpreter: p.reportInterpreter,
        actualStart: p.actualStart,
        actualEnd: p.actualEnd,
        totalMiles: p.totalMiles,
        otherFeesText: p.otherFeesText,
        serviceComplete: p.serviceComplete,
        cancellation: p.cancellation,
        cancelledBy: p.cancelledBy,
        comments: p.comments,
        signatureUrl: p.signature ? `/api/verification-signature/pending/${row.id}/${p.id}` : null,
        candidates,
        preselectedId: onlyFit.length === 1 ? onlyFit[0].id : onlyBooked.length === 1 && onlyFit.length === 0 ? onlyBooked[0].id : null,
      });
    }
  }
  return views.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

const assignSchema = z.object({
  requestId: z.string().uuid(),
  reportId: z.string().regex(/^[a-f0-9]{24}$/),
  interpreterId: z.string().uuid(),
});

export type AssignVerificationResult = { success: true; booked: boolean } | { success: false; error: string };

/** Staff chose the interpreter for a pending report: books them if needed, records the hours, clears the item. */
export async function assignVerificationInterpreter(input: unknown): Promise<AssignVerificationResult> {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return { success: false, error: NOT_ALLOWED_MESSAGE };
  }
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose an interpreter and try again." };
  try {
    const result = await assignPendingVerification({ ...parsed.data, actor: { id: session.user.id, email: session.user.email ?? null } }, liveEffects());
    return result.ok ? { success: true, booked: result.booked } : { success: false, error: result.error };
  } catch (err) {
    logError("assignVerificationInterpreter", err);
    return { success: false, error: "We could not record those hours. Nothing was changed. Please try again." };
  }
}
