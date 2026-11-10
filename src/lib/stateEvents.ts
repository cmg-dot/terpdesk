import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agencyInbox, stateSrnEvents } from "@/db/schema";
import type { InboundKind } from "@/lib/inboundMail/classify";
import { logError } from "@/lib/logError";

/**
 * What the app decided about each email that says something about a state request number (migration 0009): the classification and
 * outcome kept on the stored email, and one event row per email, keyed by its Message-ID so a redelivery changes nothing. The events
 * are the memory that lets a cancellation which arrives BEFORE its request form still apply to the job when the form creates it.
 *
 * Nothing here throws: the email is already stored, and a bookkeeping problem must never undo or block what the notice did.
 * SERVER ONLY.
 */

let ensured = false;

/**
 * Runtime fallback for a database migration 0009 has not reached (it is applied by hand BEFORE the deploy; this only keeps a missed
 * step from failing every incoming email). Same statements, all IF NOT EXISTS. Never throws; retried on the next call.
 */
export async function ensureStateEventTables(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      ALTER TABLE agency_inbox ADD COLUMN IF NOT EXISTS kind varchar(32);
      ALTER TABLE agency_inbox ADD COLUMN IF NOT EXISTS srn varchar(20);
      ALTER TABLE agency_inbox ADD COLUMN IF NOT EXISTS outcome varchar(32);
      ALTER TABLE agency_inbox ADD COLUMN IF NOT EXISTS processed_at timestamptz;
      ALTER TABLE agency_inbox ADD COLUMN IF NOT EXISTS request_id uuid;
      CREATE TABLE IF NOT EXISTS state_srn_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), srn varchar(20) NOT NULL, kind varchar(32) NOT NULL,
        occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL, message_id text NOT NULL, sender_email text,
        authenticated boolean NOT NULL DEFAULT false, outcome varchar(32), request_id uuid, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS state_srn_events_message_id_idx ON state_srn_events (message_id);
      CREATE INDEX IF NOT EXISTS state_srn_events_srn_idx ON state_srn_events (srn, occurred_at);
    `);
    ensured = true;
  } catch (err) {
    logError("ensureStateEventTables", err);
  }
}

export interface StateEventInput {
  srn: string;
  kind: InboundKind;
  /** The state's own time when the notice states one, else when it was received. */
  occurredAt: Date;
  receivedAt: Date;
  messageId: string;
  senderEmail: string;
  authenticated: boolean;
}

/** Records the event once per email. False when this email was already recorded (a redelivery) or the write failed. */
export async function recordStateEvent(event: StateEventInput): Promise<boolean> {
  try {
    const inserted = await db
      .insert(stateSrnEvents)
      .values({ srn: event.srn, kind: event.kind, occurredAt: event.occurredAt, receivedAt: event.receivedAt, messageId: event.messageId, senderEmail: event.senderEmail.toLowerCase(), authenticated: event.authenticated })
      .onConflictDoNothing({ target: stateSrnEvents.messageId })
      .returning({ id: stateSrnEvents.id });
    return inserted.length > 0;
  } catch (err) {
    logError("recordStateEvent", err);
    return false;
  }
}

export async function setEventOutcome(messageId: string, outcome: string, requestId: string | null): Promise<void> {
  try {
    await db.update(stateSrnEvents).set({ outcome, requestId }).where(eq(stateSrnEvents.messageId, messageId));
  } catch (err) {
    logError("setEventOutcome", err);
  }
}

/** Writes what the app decided onto the stored email (its kind, request number, outcome and the job it acted on). */
export async function markInboxMail(messageId: string, mark: { kind: InboundKind; srn: string | null; outcome: string; requestId: string | null }): Promise<void> {
  try {
    await db.update(agencyInbox).set({ kind: mark.kind, srn: mark.srn, outcome: mark.outcome, requestId: mark.requestId, processedAt: new Date() }).where(eq(agencyInbox.messageId, messageId));
  } catch (err) {
    logError("markInboxMail", err);
  }
}

export interface PendingCancellation {
  messageId: string;
  senderEmail: string;
  authenticated: boolean;
  occurredAt: Date;
}

/** The newest state cancellation for this number that found no job when it arrived, or null. A job created later by the form takes it. */
export async function pendingStateCancellation(srn: string): Promise<PendingCancellation | null> {
  try {
    const [row] = await db
      .select({ messageId: stateSrnEvents.messageId, senderEmail: stateSrnEvents.senderEmail, authenticated: stateSrnEvents.authenticated, occurredAt: stateSrnEvents.occurredAt })
      .from(stateSrnEvents)
      .where(and(eq(stateSrnEvents.srn, srn), eq(stateSrnEvents.kind, "state_cancellation"), eq(stateSrnEvents.outcome, "no_job")))
      .orderBy(desc(stateSrnEvents.occurredAt))
      .limit(1);
    return row && row.senderEmail ? { ...row, senderEmail: row.senderEmail } : null;
  } catch (err) {
    logError("pendingStateCancellation", err);
    return null;
  }
}
