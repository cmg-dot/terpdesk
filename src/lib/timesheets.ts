import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { requests, timesheets } from '@/db/schema';
import { getIanaZone, resolveRequestTimes, utcToWallClock } from '@/utils/timezone';
import { hashToken, TOKEN_PATTERN } from '@/lib/timesheetToken';
import { buildOdhhPortalUrl } from '@/lib/odhhPortal';
import { isStateJobRequest } from '@/lib/stateJob';

export interface TimesheetAppointment {
  timesheetId: string;
  requestId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  ianaZone: string;
  /** Scheduled start/end as wall-clock strings in the appointment zone (yyyy-MM-ddTHH:mm). */
  defaultStart: string;
  defaultEnd: string;
  format: string;
  location: string | null;
  isOdhh: boolean;
  /** Link-out to the state ODHH portal; only set for ODHH assignments. */
  odhhPortalUrl: string | null;
}

interface LooseDetails {
  timeZone?: string;
  timezone?: string;
  format?: string;
  location?: string;
  address?: string;
}

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Resolves a raw magic-link token to its appointment. Returns null when the token is
 * malformed, unknown, expired, or the timesheet is no longer 'pending'.
 */
export async function getPendingTimesheetByToken(token: string): Promise<TimesheetAppointment | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const [row] = await db
    .select({
      timesheetId: timesheets.id,
      requestId: requests.id,
      title: requests.title,
      createdAt: requests.createdAt,
      data: requests.data,
      isStateJob: requests.isStateJob,
    })
    .from(timesheets)
    .innerJoin(requests, eq(timesheets.requestId, requests.id))
    .where(
      and(
        eq(timesheets.tokenHash, hashToken(token)),
        eq(timesheets.status, 'pending'),
        gt(timesheets.tokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (isStateJobRequest(row)) return null;

  const { startsAt, endsAt } = resolveRequestTimes({ createdAt: row.createdAt, data: row.data });
  const data = row.data as unknown as { details?: LooseDetails; intake?: { program?: string; odhhSrn?: string } } & LooseDetails;
  const details: LooseDetails = data.details ?? {};
  const isOdhh = data.intake?.program === "WA ODHH" || data.intake?.program === "wa_odhh";
  const srn = asText(data.intake?.odhhSrn);
  const ianaZone = getIanaZone(details.timeZone ?? details.timezone ?? data.timeZone ?? data.timezone);

  return {
    timesheetId: row.timesheetId,
    requestId: row.requestId,
    title: row.title,
    startsAt,
    endsAt,
    ianaZone,
    defaultStart: utcToWallClock(startsAt, ianaZone),
    defaultEnd: utcToWallClock(endsAt, ianaZone),
    format: asText(details.format) ?? asText(data.format) ?? 'In person',
    location: asText(details.location) ?? asText(details.address) ?? asText(data.location),
    isOdhh,
    odhhPortalUrl: isOdhh ? buildOdhhPortalUrl(srn) : null,
  };
}
