import { and, gt, inArray, lt, eq } from "drizzle-orm";
import { db } from "@/db";
import { busyBlocks, offers, requests } from "@/db/schema";
import { ensureAvailabilityTables } from "@/lib/availability/ensureTables";
import { isUuid, resolveInterpreterIds } from "@/lib/availability/ids";
import { hasPersonalJobConflict } from "@/lib/availability/personalJobConflict";
import { logError } from "@/lib/logError";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Plain server code (not a Server Action): every caller is on the server, and as a public action it answered "is this interpreter
 * busy?" for any id, with no sign-in check.
 */

/**
 * Check if interpreter has an overlapping booked job, busy block or personal job.
 */
export async function td_conflict(params: {
  interpreterId: string;
  startsAtUtc: string | Date;
  endsAtUtc: string | Date;
  excludeRequestId?: string;
}): Promise<{ hasConflict: boolean; reason?: "job" | "busy" }> {
  try {
    await ensureAvailabilityTables();
    const { interpreterId, startsAtUtc, endsAtUtc, excludeRequestId } = params;
    const targetIds = await resolveInterpreterIds(interpreterId);
    const offerInterpreterIds = targetIds.filter(isUuid);
    const startTarget = new Date(startsAtUtc);
    const endTarget = new Date(endsAtUtc);

    // offers.interpreter_id is a UUID column, while availability tables also
    // support mock text IDs such as "terp-1". Never pass those mock IDs to the
    // UUID query.
    if (offerInterpreterIds.length > 0) {
      const acceptedOffers = await db
        .select({
          offerId: offers.id,
          requestId: offers.requestId,
          reqStatus: requests.status,
          reqData: requests.data,
          reqCreatedAt: requests.createdAt,
        })
        .from(offers)
        .innerJoin(requests, eq(offers.requestId, requests.id))
        .where(
          and(
            inArray(offers.interpreterId, offerInterpreterIds),
            eq(offers.status, "accepted")
          )
        );

      for (const row of acceptedOffers) {
        if (excludeRequestId && row.requestId === excludeRequestId) continue;
        const reqStat = String(row.reqStatus || "").toLowerCase();
        if (reqStat === "cancelled" || reqStat === "canceled") continue;

        const { startsAt: existingStartStr, endsAt: existingEndStr } = resolveRequestTimes({
          createdAt: row.reqCreatedAt,
          data: row.reqData,
        });
        const exStart = new Date(existingStartStr);
        const exEnd = new Date(existingEndStr);

        if (exStart < endTarget && exEnd > startTarget) {
          return { hasConflict: true, reason: "job" };
        }
      }
    }

    // 2. Check private busy blocks. This table stores text IDs, so it accepts
    // both UUID and mock interpreter identifiers.
    const overlappingBusy = await db
      .select()
      .from(busyBlocks)
      .where(
        and(
          inArray(busyBlocks.interpreterId, targetIds),
          lt(busyBlocks.startsAt, endTarget),
          gt(busyBlocks.endsAt, startTarget)
        )
      )
      .limit(1);

    if (overlappingBusy.length > 0) {
      return { hasConflict: true, reason: "busy" };
    }

    // 3. Personal jobs (work done outside any agency). They count as busy time, so nothing says what they are. The table is keyed by
    // the interpreter's UUID, so mock ids are skipped. A missing table counts as none; any other failure lands in the catch below.
    if (await hasPersonalJobConflict(offerInterpreterIds, startTarget, endTarget)) {
      return { hasConflict: true, reason: "busy" };
    }

    return { hasConflict: false };
  } catch (error) {
    logError("availability conflict lookup", error);
    // Fail closed: do not expose a database error or label an uncertain
    // interpreter as available.
    return { hasConflict: true, reason: "job" };
  }
}
