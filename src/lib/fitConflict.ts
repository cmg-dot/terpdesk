/**
 * The "double-booked or busy" tier of an interpreter's availability for a job (app/actions/interpreterFit.ts, checkInterpreterFit), with
 * the conflict lookup passed in so it is tested without a database. The job being staffed is always left out of the lookup: its own
 * accepted offer (an interpreter booked on it, or removed from it a moment ago) is not "another booking" and must never make that
 * interpreter show as "unavailable" for the very job they are on. Pure.
 */

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A request id the browser sent, or undefined for anything else (then every booking counts, which is the stricter reading). */
export const cleanRequestId = (value: unknown): string | undefined => (typeof value === "string" && REQUEST_ID.test(value) ? value : undefined);

export type ConflictLookup = (params: { interpreterId: string; startsAtUtc: Date; endsAtUtc: Date; excludeRequestId?: string }) => Promise<{ hasConflict: boolean }>;

/** True when any of the interpreter's ids has another booking or busy time overlapping the job (this job excluded). */
export async function hasScheduleConflict(
  params: { interpreterIds: readonly string[]; startsAtUtc: Date; endsAtUtc: Date; excludeRequestId?: string },
  lookup: ConflictLookup,
): Promise<boolean> {
  for (const interpreterId of params.interpreterIds) {
    const { hasConflict } = await lookup({ interpreterId, startsAtUtc: params.startsAtUtc, endsAtUtc: params.endsAtUtc, excludeRequestId: params.excludeRequestId });
    if (hasConflict) return true;
  }
  return false;
}
