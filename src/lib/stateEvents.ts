import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
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

/**
 * The state's own notices reach the app through two doors for one email: the Inbox webhook (keyed by the email's real Message-ID) and
 * the Lambda's /api/intake (no Message-ID, so keyed by a fingerprint). The Message-ID key can never see that they are the same email,
 * so each notice was recorded twice, up to about a minute apart. Requester replies are left out: two replies are two emails.
 */
const TWIN_CHECKED_KINDS: ReadonlySet<InboundKind> = new Set<InboundKind>(["state_in_process", "state_cancellation"]);
/** How far apart two copies of one notice may arrive and still count as the same notice. */
export const TWIN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Records the event once per email. False when this email was already recorded (a redelivery), when its other door already recorded it
 * (see TWIN_CHECKED_KINDS), or when the write failed. A twin is the same request number and kind, from the same sender with the same
 * authentication, received within TWIN_WINDOW_MS; a cancellation must also state the same cancellation time, so a different notice
 * (a forward, a second sender, a later cancellation) is never mistaken for a copy. A skipped twin writes nothing and is not an error.
 */
export async function recordStateEvent(event: StateEventInput): Promise<boolean> {
  try {
    const senderEmail = event.senderEmail.toLowerCase();
    const values = { srn: event.srn, kind: event.kind, occurredAt: event.occurredAt, receivedAt: event.receivedAt, messageId: event.messageId, senderEmail, authenticated: event.authenticated };
    if (!TWIN_CHECKED_KINDS.has(event.kind)) {
      const inserted = await db.insert(stateSrnEvents).values(values).onConflictDoNothing({ target: stateSrnEvents.messageId }).returning({ id: stateSrnEvents.id });
      return inserted.length > 0;
    }
    const inserted = await db.transaction(async (tx) => {
      // Both doors can run at the same moment, so the look and the write are serialised per request number and kind.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`state_srn_event:${event.srn}:${event.kind}`}))`);
      const [twin] = await tx
        .select({ id: stateSrnEvents.id })
        .from(stateSrnEvents)
        .where(
          and(
            eq(stateSrnEvents.srn, event.srn),
            eq(stateSrnEvents.kind, event.kind),
            eq(stateSrnEvents.senderEmail, senderEmail),
            eq(stateSrnEvents.authenticated, event.authenticated),
            gte(stateSrnEvents.receivedAt, new Date(event.receivedAt.getTime() - TWIN_WINDOW_MS)),
            lte(stateSrnEvents.receivedAt, new Date(event.receivedAt.getTime() + TWIN_WINDOW_MS)),
            event.kind === "state_cancellation" ? eq(stateSrnEvents.occurredAt, event.occurredAt) : undefined,
          ),
        )
        .limit(1);
      if (twin) {
        console.debug(`[idempotency] skipped duplicate ${event.kind} event for SRN ${event.srn}`);
        return [];
      }
      return tx.insert(stateSrnEvents).values(values).onConflictDoNothing({ target: stateSrnEvents.messageId }).returning({ id: stateSrnEvents.id });
    });
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
