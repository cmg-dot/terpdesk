import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { offers, requests, timesheets } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { alertInterpreter } from "@/lib/lifecycleAlerts";
import { logError } from "@/lib/logError";
import { notifyInterpreter } from "@/lib/notifications";
import { hasSubmittedHours } from "@/lib/onsiteSignature";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { isVoidedData } from "@/lib/voidReasons";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * Cancelling a job, in one place and with no login needed: the agency's "Cancel" button (actions/cancelRequest.ts), the state's
 * cancellation notice and a dispatcher confirming a requester's email all end here, so a cancelled job looks the same whichever
 * way it was cancelled. In ONE transaction under the request's row lock:
 *  - the request becomes 'Cancelled' (the first cancellation's time and reason are kept) and a `data.cancellation` record keeps
 *    when it was cancelled and how many hours of notice the appointment had;
 *  - every booked interpreter's offer becomes 'cancelled', so the booking leaves their jobs, calendar and "happening now"
 *    (those read offers and the request's status, so there is no separate calendar entry to remove);
 *  - every open offer becomes 'withdrawn', so nobody can still accept it.
 * Billing is NEVER changed here: the notice hours are recorded for staff, who decide. Running it again on a cancelled job is safe and
 * also repairs offers a past cancellation left behind. SERVER ONLY.
 */

export type CancelSource = "staff" | "state_notice" | "requester_confirmed";

export interface CancelOptions {
  source: CancelSource;
  reason?: string | null;
  clientRequested?: boolean;
  /** The state's own cancellation time, when its notice states one. Never later than now. */
  cancelledAt?: Date | null;
  srn?: string | null;
  /** Automatic cancellations only: leave a job alone once hours were reported on it (a person must look at it). */
  refuseWithHours?: boolean;
  now?: Date;
}

export interface CancellationRecord {
  /** When it was cancelled (the state's own time when it gave one). */
  at: string;
  /** When terpDESK recorded it. */
  recordedAt: string;
  /** Hours between the cancellation and the appointment's start; negative when it was cancelled after the start. Null when the start is unknown. */
  noticeHours: number | null;
  source: CancelSource;
  srn?: string;
}

export interface LiveOffer {
  id: string;
  interpreterId: string;
  status: string;
}

export type CancelledResult = { status: "cancelled" | "already_cancelled"; updated: typeof requests.$inferSelect; live: LiveOffer[]; noticeHours: number | null };
export type CancelCoreResult = CancelledResult | { status: "not_found" } | { status: "already_voided" } | { status: "hours_reported" };

/** Offer status given to a booking when its appointment is cancelled, and to an open offer (closed, as when staff withdraw it). */
const BOOKING_CANCELLED = "cancelled";
const OFFER_WITHDRAWN = "withdrawn";

type Executor = Pick<typeof db, "transaction">;

const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

export async function cancelJobCore(requestId: string, opts: CancelOptions, exec: Executor = db): Promise<CancelCoreResult> {
  const now = opts.now ?? new Date();
  return exec.transaction(async (tx): Promise<CancelCoreResult> => {
    // Serialises with accepts, give-backs and edits on the same job, so none can slip in half-way through.
    const locked = await lockRequestForPosition(tx, requestId);
    if (!locked) return { status: "not_found" };

    const alreadyCancelled = /^cancell?ed$/i.test(locked.status.trim());
    // A void is a different close-out with its own rules; only a person's own Cancel button may act on one (as it always could).
    if (opts.source !== "staff" && isVoidedData(locked.data)) return { status: "already_voided" };
    if (!alreadyCancelled && opts.refuseWithHours) {
      const [sheet] = await tx.select({ id: timesheets.id }).from(timesheets).where(eq(timesheets.requestId, requestId)).limit(1);
      if (sheet || hasSubmittedHours(locked.data)) return { status: "hours_reported" };
    }

    const at = opts.cancelledAt && opts.cancelledAt.getTime() <= now.getTime() ? opts.cancelledAt : now;
    const startMs = Date.parse(resolveRequestTimes({ createdAt: locked.createdAt, data: locked.data }).startsAt);
    const noticeHours = Number.isFinite(startMs) ? oneDecimal((startMs - at.getTime()) / 3_600_000) : null;
    const record: CancellationRecord = { at: at.toISOString(), recordedAt: now.toISOString(), noticeHours, source: opts.source, ...(opts.srn ? { srn: opts.srn } : {}) };

    const [updated] = await tx
      .update(requests)
      .set(
        alreadyCancelled
          ? { updatedAt: now }
          : {
              status: "Cancelled",
              canceledAt: at,
              cancelReason: opts.reason || null,
              clientRequestedCancellation: opts.clientRequested === true,
              data: { ...locked.data, cancellation: record } as never,
              updatedAt: now,
            },
      )
      .where(eq(requests.id, requestId))
      .returning();

    const live = await tx
      .select({ id: offers.id, interpreterId: offers.interpreterId, status: offers.status })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), inArray(offers.status, ["accepted", "pending"])));
    const bookedIds = live.filter((o) => o.status === "accepted").map((o) => o.id);
    const openIds = live.filter((o) => o.status === "pending").map((o) => o.id);
    if (bookedIds.length > 0) await tx.update(offers).set({ status: BOOKING_CANCELLED, updatedAt: now }).where(inArray(offers.id, bookedIds));
    if (openIds.length > 0) await tx.update(offers).set({ status: OFFER_WITHDRAWN, updatedAt: now }).where(inArray(offers.id, openIds));

    return { status: alreadyCancelled ? "already_cancelled" : "cancelled", updated, live, noticeHours };
  });
}

export interface CancelAftermath {
  clientRequested: boolean;
  /** Who the shared activity entry names: "Agency staff", "State email". */
  actorLabel: string;
  /** Agency-only lines added after the shared one (what triggered it, how much notice there was). Written only for a new cancellation. */
  agencyNotes?: { kind: string; message: string }[];
  /** An audit row (ids and fixed labels only), when the caller wants one. */
  audit?: { action: string; userId: string | null; userEmail: string | null; details?: string };
}

/**
 * What follows a cancellation: the shared activity entry (the reason is internal, so it never goes in it), the agency-only notes,
 * the audit row, one notice per affected interpreter (booked: in-app and email with reference, date and location; open offer only:
 * an in-app notice that it was withdrawn) and fresh pages. Interpreter notices carry no job details beyond that.
 */
export async function afterCancel(requestId: string, result: CancelledResult, after: CancelAftermath): Promise<void> {
  if (result.status === "cancelled") {
    await logActivity({ requestId, audience: "shared", kind: "cancelled", message: after.clientRequested ? "Appointment cancelled (client request)" : "Appointment cancelled", actorLabel: after.actorLabel });
    for (const note of after.agencyNotes ?? []) await logActivity({ requestId, audience: "agency", kind: note.kind, message: note.message, actorLabel: after.actorLabel });
  }
  if (after.audit) {
    await writeAuditLog({ userId: after.audit.userId, userEmail: after.audit.userEmail, action: after.audit.action, details: `requestId=${requestId}; interpreters=${new Set(result.live.map((o) => o.interpreterId)).size}${after.audit.details ? `; ${after.audit.details}` : ""}` });
  }

  const notified = new Set<string>();
  for (const offer of result.live) {
    if (notified.has(offer.interpreterId)) continue;
    notified.add(offer.interpreterId);
    const booking = result.live.find((o) => o.interpreterId === offer.interpreterId && o.status === "accepted");
    if (booking) {
      await alertInterpreter({ event: "booking_cancelled", requestId, interpreterId: offer.interpreterId, offerId: booking.id });
    } else {
      await notifyInterpreter(offer.interpreterId, { type: "job", href: "/jobs", title: "Offer withdrawn", message: "An offer you received was withdrawn because the appointment was cancelled." });
    }
  }

  // Agency side, then the interpreter side: the jobs list, each job page (/jobs/[id] is keyed by offer, so refresh the whole route), home and calendar.
  // A page refresh that cannot run (outside a web request, or a cache hiccup) must never make a cancellation that already happened look failed.
  try {
    for (const path of [`/requests/${requestId}`, "/requests", "/dashboard", "/calendar", "/hours-review", "/jobs", "/interpreter-home", "/interpreter-calendar", "/inbox"]) revalidatePath(path);
    revalidatePath("/jobs/[id]", "page");
  } catch (error) {
    logError("afterCancel revalidate", error);
  }
}
