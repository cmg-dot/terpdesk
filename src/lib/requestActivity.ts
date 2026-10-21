import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, requestActivity } from "@/db/schema";
import type { ActivityAudience, ActivityChange } from "@/db/schema";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { logError } from "@/lib/logError";

/**
 * The request activity log (see `requestActivity` in the schema). Writes never throw: a failed log line must not undo
 * or block the action it describes. Never put PHI-heavy free text (client names, notes, billing codes) in a
 * message; field changes carry only interpreter-facing job fields.
 *
 * SERVER ONLY.
 */

const MAX_ENTRIES = 100;
/** Kind of an agency message to one booked interpreter (see jobUpdateNotice.ts). Shown in its own "Messages" card. */
export const AGENCY_MESSAGE_KIND = "agency_message";
let tableEnsured = false;
let ensureInFlight: Promise<void> | null = null;

/** Runtime fallback for databases `drizzle-kit push` has not reached. Never throws; retried on the next call. */
async function ensureActivityTable(): Promise<void> {
  if (tableEnsured) return;
  ensureInFlight ??= db
    .execute(sql`
      CREATE TABLE IF NOT EXISTS request_activity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        interpreter_id UUID REFERENCES interpreters(id) ON DELETE SET NULL,
        audience VARCHAR(10) NOT NULL DEFAULT 'agency',
        kind VARCHAR(40) NOT NULL,
        message TEXT NOT NULL,
        changes JSONB,
        actor_label VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS request_activity_request_created_idx ON request_activity (request_id, created_at);
    `)
    .then(() => {
      tableEnsured = true;
    })
    .catch((err: unknown) => logError("ensureActivityTable", err))
    .finally(() => {
      ensureInFlight = null;
    });
  await ensureInFlight;
}

export interface ActivityInput {
  requestId: string;
  kind: string;
  message: string;
  audience?: ActivityAudience;
  interpreterId?: string | null;
  changes?: ActivityChange[];
  actorLabel?: string | null;
}

export async function logActivity(entry: ActivityInput): Promise<void> {
  try {
    await ensureActivityTable();
    await db.insert(requestActivity).values({
      requestId: entry.requestId,
      kind: entry.kind.slice(0, 40),
      message: entry.message.slice(0, 2000),
      audience: entry.audience ?? "agency",
      interpreterId: entry.interpreterId ?? null,
      changes: entry.changes && entry.changes.length > 0 ? entry.changes : null,
      actorLabel: entry.actorLabel ? entry.actorLabel.slice(0, 120) : null,
    });
  } catch (err) {
    logError("logActivity", err);
  }
}

export interface ActivityItem {
  id: string;
  kind: string;
  message: string;
  audience: ActivityAudience;
  changes: ActivityChange[];
  actorLabel: string | null;
  interpreterName: string | null;
  createdAt: string;
}

const toItem = (row: {
  id: string;
  kind: string;
  message: string;
  audience: ActivityAudience;
  changes: ActivityChange[] | null;
  actorLabel: string | null;
  interpreterName?: string | null;
  createdAt: Date;
}): ActivityItem => ({
  id: row.id,
  kind: row.kind,
  message: row.message,
  audience: row.audience,
  changes: Array.isArray(row.changes) ? row.changes : [],
  actorLabel: row.actorLabel,
  interpreterName: row.interpreterName ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Every entry for a request, newest first (agency staff only: the caller must have checked the role). */
export async function listActivityForAgency(requestId: string): Promise<ActivityItem[]> {
  await ensureActivityTable();
  await ensureDisplayNameColumns();
  const rows = await db
    .select({
      id: requestActivity.id,
      kind: requestActivity.kind,
      message: requestActivity.message,
      audience: requestActivity.audience,
      changes: requestActivity.changes,
      actorLabel: requestActivity.actorLabel,
      interpreterName: interpreterDisplayName,
      createdAt: requestActivity.createdAt,
    })
    .from(requestActivity)
    .leftJoin(interpreters, eq(requestActivity.interpreterId, interpreters.id))
    .where(eq(requestActivity.requestId, requestId))
    .orderBy(desc(requestActivity.createdAt))
    .limit(MAX_ENTRIES);
  return rows.map(toItem);
}

/** What a booked interpreter may see: shared entries for everyone, plus shared entries about them only. */
export async function listActivityForInterpreter(requestId: string, interpreterId: string): Promise<ActivityItem[]> {
  await ensureActivityTable();
  const rows = await db
    .select({
      id: requestActivity.id,
      kind: requestActivity.kind,
      message: requestActivity.message,
      audience: requestActivity.audience,
      changes: requestActivity.changes,
      actorLabel: requestActivity.actorLabel,
      createdAt: requestActivity.createdAt,
    })
    .from(requestActivity)
    .where(
      and(
        eq(requestActivity.requestId, requestId),
        eq(requestActivity.audience, "shared"),
        or(isNull(requestActivity.interpreterId), eq(requestActivity.interpreterId, interpreterId)),
        // Agency messages have their own card (listAgencyMessages).
        ne(requestActivity.kind, AGENCY_MESSAGE_KIND),
      ),
    )
    .orderBy(desc(requestActivity.createdAt))
    .limit(MAX_ENTRIES);
  return rows.map(toItem);
}

export interface AgencyMessage {
  id: string;
  text: string;
  from: string | null;
  sentAt: string;
}

/** Messages the agency sent to THIS interpreter about a request, newest first. Never another interpreter's. */
export async function listAgencyMessages(requestId: string, interpreterId: string): Promise<AgencyMessage[]> {
  await ensureActivityTable();
  const rows = await db
    .select({ id: requestActivity.id, message: requestActivity.message, actorLabel: requestActivity.actorLabel, createdAt: requestActivity.createdAt })
    .from(requestActivity)
    .where(
      and(
        eq(requestActivity.requestId, requestId),
        eq(requestActivity.kind, AGENCY_MESSAGE_KIND),
        eq(requestActivity.interpreterId, interpreterId),
      ),
    )
    .orderBy(desc(requestActivity.createdAt))
    .limit(50);
  return rows.map((r) => ({ id: r.id, text: r.message, from: r.actorLabel, sentAt: r.createdAt.toISOString() }));
}
