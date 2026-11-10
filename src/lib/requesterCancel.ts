import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { afterCancel, cancelJobCore } from "@/lib/cancelJob";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { logActivity } from "@/lib/requestActivity";
import { cancelRequestFlagOf } from "@/lib/cancelRequestFlag";
import type { CancelRequestFlag } from "@/lib/cancelRequestFlag";
import { timingNote } from "@/lib/stateCancelNotice";

/**
 * A requester who EMAILS to ask for a cancellation ("Please cancel this request") does not cancel anything: the job is flagged for a
 * dispatcher, with a banner showing what they wrote and a one-click Confirm, because the requester often has to cancel in the state's
 * portal as well and an accidental drop is worse than a short wait. The flag is `data.cancelRequest`; confirming cancels the job through
 * the same close-out as every other cancellation (cancelJob.ts) and marks it a client request. Billing is never changed.
 *
 * Nothing the sender wrote is ever logged: the snippet lives only on the job (agency-only data) and is shown React-escaped.
 * SERVER ONLY.
 */

export { cancelRequestFlagOf } from "@/lib/cancelRequestFlag";
export type { CancelRequestFlag } from "@/lib/cancelRequestFlag";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Mail providers whose domain says nothing about who someone works for. */
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "aol.com", "comcast.net", "proton.me", "protonmail.com"]);
const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1).toLowerCase();

/** The sender is one of the job's requester or billing-contact addresses, or shares an organisation's own domain with one. */
export function senderMatchesJob(senderEmail: string, data: unknown): boolean {
  const d = (data ?? {}) as { requester?: Record<string, unknown>; source?: Record<string, unknown> };
  const known = [d.requester?.email, d.requester?.billEmail, d.source?.fromEmail].map(str).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  const sender = senderEmail.trim().toLowerCase();
  if (!sender.includes("@")) return false;
  return known.some((e) => e === sender || (domainOf(e) === domainOf(sender) && !FREE_MAIL.has(domainOf(sender))));
}

const isClosed = (status: string): boolean => /^cancell?ed$/i.test(status.trim());
const srnOfData = (data: unknown): string | null => str((data as { intake?: { odhhSrn?: unknown } } | null)?.intake?.odhhSrn) || null;

export type FlagOutcome = { outcome: "flagged" | "already_flagged" | "already_closed"; id: string } | { outcome: "no_job" | "failed" };

export interface RequesterCancelInput {
  srn: string;
  senderEmail: string;
  snippet: string | null;
  messageId: string;
  receivedAt: Date;
}

export async function processRequesterCancelRequest(input: RequesterCancelInput): Promise<FlagOutcome> {
  try {
    const jobs = await db.select({ id: requests.id, status: requests.status }).from(requests).where(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, input.srn)).orderBy(desc(requests.updatedAt));
    if (jobs.length === 0) return { outcome: "no_job" };
    const active = jobs.find((j) => !isClosed(j.status));
    if (!active) return { outcome: "already_closed", id: jobs[0].id };

    const outcome = await db.transaction(async (tx): Promise<FlagOutcome["outcome"]> => {
      const [row] = await tx.select({ status: requests.status, data: requests.data }).from(requests).where(eq(requests.id, active.id)).for("update");
      if (!row || isClosed(row.status)) return "already_closed";
      // The same email can arrive through both doors under different ids, so the same sender saying the same thing counts as one request.
      const existing = cancelRequestFlagOf(row.data);
      if (existing && (existing.messageId === input.messageId || (!existing.dismissedAt && existing.senderEmail === input.senderEmail.toLowerCase() && existing.snippet === input.snippet))) return "already_flagged";
      const flag: CancelRequestFlag = { at: new Date().toISOString(), receivedAt: input.receivedAt.toISOString(), snippet: input.snippet, senderEmail: input.senderEmail.toLowerCase(), senderMatches: senderMatchesJob(input.senderEmail, row.data), messageId: input.messageId };
      await tx.update(requests).set({ data: { ...row.data, cancelRequest: flag } as never, updatedAt: new Date() }).where(eq(requests.id, active.id));
      return "flagged";
    });
    if (outcome === "flagged") {
      await logActivity({ requestId: active.id, kind: "cancel_requested", audience: "agency", message: "Requester asked to cancel by email (not yet confirmed)", actorLabel: "Email intake" });
      await notifyAgencyAdmins({ type: "job", href: `/requests/${active.id}`, title: "Cancellation requested by email", message: `A requester asked to cancel SRN #${input.srn} by email. Open the request to confirm or dismiss.` });
    }
    return { outcome, id: active.id };
  } catch (error) {
    logError("Requester cancellation request", error);
    return { outcome: "failed" };
  }
}

export interface Actor {
  label: string;
  userId: string | null;
  userEmail: string | null;
}

export type ConfirmOutcome = { outcome: "cancelled" | "already_cancelled"; id: string } | { outcome: "no_request" | "not_flagged" | "failed" };

/** A dispatcher confirms: cancel the job as a client request. Only a job that carries a live (not dismissed) flag. */
export async function confirmRequesterCancellation(requestId: string, actor: Actor): Promise<ConfirmOutcome> {
  try {
    const [job] = await db.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!job) return { outcome: "no_request" };
    const flag = cancelRequestFlagOf(job.data);
    if (!flag || flag.dismissedAt) return { outcome: "not_flagged" };
    const result = await cancelJobCore(requestId, { source: "requester_confirmed", clientRequested: true, reason: "Cancelled at the requester's request (email)", srn: srnOfData(job.data) });
    if (result.status !== "cancelled" && result.status !== "already_cancelled") return { outcome: "not_flagged" };
    if (result.status === "cancelled") {
      await afterCancel(requestId, result, {
        clientRequested: true,
        actorLabel: actor.label,
        agencyNotes: [
          { kind: "cancel_confirmed", message: "Cancellation confirmed by staff after the requester's email" },
          { kind: "cancel_notice_timing", message: timingNote(new Date(result.updated.canceledAt ?? Date.now()), result.noticeHours) },
        ],
        audit: { action: "request_cancelled_requester", userId: actor.userId, userEmail: actor.userEmail },
      });
    } else {
      await afterCancel(requestId, result, { clientRequested: true, actorLabel: actor.label });
    }
    return { outcome: result.status, id: requestId };
  } catch (error) {
    logError("Confirm requester cancellation", error);
    return { outcome: "failed" };
  }
}

/** A dispatcher decides the email does not mean a cancellation: the banner goes away and nothing else changes. */
export async function dismissRequesterCancellation(requestId: string, actor: Actor): Promise<{ outcome: "dismissed" | "not_flagged" | "failed" }> {
  try {
    const outcome = await db.transaction(async (tx): Promise<"dismissed" | "not_flagged"> => {
      const [row] = await tx.select({ data: requests.data }).from(requests).where(eq(requests.id, requestId)).for("update");
      const flag = row ? cancelRequestFlagOf(row.data) : null;
      if (!row || !flag || flag.dismissedAt) return "not_flagged";
      await tx.update(requests).set({ data: { ...row.data, cancelRequest: { ...flag, dismissedAt: new Date().toISOString() } } as never, updatedAt: new Date() }).where(eq(requests.id, requestId));
      return "dismissed";
    });
    if (outcome === "dismissed") {
      await logActivity({ requestId, kind: "cancel_request_dismissed", audience: "agency", message: "Requester's cancellation request dismissed by staff", actorLabel: actor.label });
      await writeAuditLog({ userId: actor.userId, userEmail: actor.userEmail, action: "cancel_request_dismissed", details: `requestId=${requestId}` });
    }
    return { outcome };
  } catch (error) {
    logError("Dismiss requester cancellation", error);
    return { outcome: "failed" };
  }
}
