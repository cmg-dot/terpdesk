"use server";

import { and, eq, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import { availabilityExceptions, availabilityRules, availabilityShares, interpreterProfiles } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { td_conflict } from "@/lib/availability/conflict";
import { ensureAvailabilityTables } from "@/lib/availability/ensureTables";
import { resolveInterpreterIds } from "@/lib/availability/ids";
import { requireRole } from "@/lib/auth/guards";
import { cleanRequestId, hasScheduleConflict } from "@/lib/fitConflict";
import type { InterpreterFitStatus } from "@/lib/interpreterFit";
import { logError } from "@/lib/logError";
import { getIanaZone } from "@/utils/timezone";

/**
 * 6-Tier Classification Algorithm (First match wins):
 * 1. Double-booked -> "unavailable"
 * 2. Private busy -> "unavailable" (Privacy: unified status, never leak busy title or details!)
 * 3. Not shared -> "not_shared" (the interpreter has not switched sharing on for this agency, or never set it)
 * 4. Not provided -> "not_provided" (evaluated in interpreter's profile timezone)
 * 5. Outside hours -> "outside_hours" (evaluated in interpreter's profile timezone)
 * 6. Available -> "available"
 */
export async function checkInterpreterFit(params: {
  interpreterId: string;
  /** Accepted for older callers but ignored: the agency is always the signed-in staff member's own (never the browser's). */
  agencyId?: string;
  jobStartsAtUtc: string | Date;
  jobEndsAtUtc: string | Date;
  jobTimeZone?: string;
  /**
   * The job being staffed. Its own bookings never count against it: an interpreter booked on this job, or removed from it, would
   * otherwise clash with the job's own window and show "unavailable" for the very job they are on. Anything that is not a request
   * id is ignored (the check then simply counts every booking).
   */
  excludeRequestId?: string;
}): Promise<{ fit: InterpreterFitStatus }> {
  await requireRole("agency");
  await ensureAvailabilityTables();
  const { interpreterId, jobStartsAtUtc, jobEndsAtUtc } = params;
  const excludeRequestId = cleanRequestId(params.excludeRequestId);
  // Staff accounts have no agency of their own yet, so the workspace's single agency is used. Always checking it
  // (instead of an optional, browser-supplied id) means the sharing check can never be skipped.
  const agencyId = DEFAULT_AGENCY_ID;

  const targetIds = await resolveInterpreterIds(interpreterId);

  const jobStartsDate = new Date(jobStartsAtUtc);
  const jobEndsDate = new Date(jobEndsAtUtc);

  // --- Tier 1 & 2: Double-booked or Private busy ---
  if (await hasScheduleConflict({ interpreterIds: targetIds, startsAtUtc: jobStartsDate, endsAtUtc: jobEndsDate, excludeRequestId }, td_conflict)) {
    // Privacy rule: Tier 1 & 2 unify into "unavailable". Never leak title or private details.
    return { fit: "unavailable" };
  }

  // --- Tier 3: Not shared ---
  // Sharing is opt-in: the interpreter must have switched "Share my availability" on for this agency. No saved
  // setting means they never did, so it counts as not shared (same rule as the agency's interpreter detail page).
  const shares = await db
    .select({ enabled: availabilityShares.enabled })
    .from(availabilityShares)
    .where(and(inArray(availabilityShares.interpreterId, targetIds), eq(availabilityShares.agencyId, agencyId)));
  if (!shares.some((share) => share.enabled)) {
    return { fit: "not_shared" };
  }

  // Fetch interpreter's profile timezone across target IDs
  const profiles = await db
    .select()
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, targetIds))
    .limit(1);

  const profileZone = getIanaZone(
    profiles[0]?.timeZone || params.jobTimeZone || "America/Los_Angeles"
  );

  // Derive the weekday from the interpreter-local calendar date. Parsing that
  // date at UTC noon makes this a pure Gregorian-date calculation, independent
  // of the server or browser timezone.
  const localStartDateStr = formatInTimeZone(jobStartsDate, profileZone, "yyyy-MM-dd");
  const weekday = new Date(`${localStartDateStr}T12:00:00.000Z`).getUTCDay();

  const startHour = parseInt(formatInTimeZone(jobStartsDate, profileZone, "H"), 10);
  const startMinute = parseInt(formatInTimeZone(jobStartsDate, profileZone, "m"), 10);
  const jobStartMin = startHour * 60 + startMinute;

  const localEndDateStr = formatInTimeZone(jobEndsDate, profileZone, "yyyy-MM-dd");
  const endHour = parseInt(formatInTimeZone(jobEndsDate, profileZone, "H"), 10);
  const endMinute = parseInt(formatInTimeZone(jobEndsDate, profileZone, "m"), 10);
  let jobEndMin = endHour * 60 + endMinute;

  if (localEndDateStr !== localStartDateStr) {
    const sDateOnly = new Date(localStartDateStr + "T00:00:00Z").getTime();
    const eDateOnly = new Date(localEndDateStr + "T00:00:00Z").getTime();
    const dayDiff = Math.max(1, Math.round((eDateOnly - sDateOnly) / 86400000));
    jobEndMin += dayDiff * 1440;
  }

  // Check exceptions first
  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        inArray(availabilityExceptions.interpreterId, targetIds),
        eq(availabilityExceptions.onDate, localStartDateStr)
      )
    );

  if (exceptions.length > 0) {
    const exception = exceptions[0];
    if (!exception.available) {
      return { fit: "outside_hours" };
    }
    if (exception.startMinute != null && exception.endMinute != null) {
      if (exception.startMinute <= jobStartMin && jobEndMin <= exception.endMinute) {
        return { fit: "available" };
      }
      return { fit: "outside_hours" };
    }
    return { fit: "available" };
  }

  // Check weekly rules in profile timezone
  const rules = await db
    .select()
    .from(availabilityRules)
    .where(
      and(
        inArray(availabilityRules.interpreterId, targetIds),
        eq(availabilityRules.weekday, weekday)
      )
    );

  // --- Tier 4: Not provided ---
  if (rules.length === 0) {
    return { fit: "not_provided" };
  }

  // --- Tier 5: Outside hours ---
  const coversJob = rules.some(
    (r) => r.startMinute <= jobStartMin && jobEndMin <= r.endMinute
  );

  if (!coversJob) {
    return { fit: "outside_hours" };
  }

  // --- Tier 6: Available ---
  return { fit: "available" };
}

/**
 * Batch fit evaluation for agency staffing cards.
 */
export async function getInterpretersFitForJob(params: {
  interpreterIds: string[];
  agencyId?: string;
  jobStartsAtUtc: string | Date;
  jobEndsAtUtc: string | Date;
  jobTimeZone?: string;
  /** The job being staffed: its own bookings do not count against its window (see checkInterpreterFit). */
  excludeRequestId?: string;
}): Promise<Record<string, InterpreterFitStatus>> {
  await requireRole("agency");
  const result: Record<string, InterpreterFitStatus> = {};
  for (const interpreterId of params.interpreterIds) {
    try {
      const { fit } = await checkInterpreterFit({
        interpreterId,
        agencyId: params.agencyId,
        jobStartsAtUtc: params.jobStartsAtUtc,
        jobEndsAtUtc: params.jobEndsAtUtc,
        jobTimeZone: params.jobTimeZone,
        excludeRequestId: params.excludeRequestId,
      });
      result[interpreterId] = fit;
    } catch (error) {
      logError("availability lookup", error);
      result[interpreterId] = "unavailable";
    }
  }
  return result;
}
