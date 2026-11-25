import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { announceEdit, detailsUpdateFlag, planEditNotice } from "@/lib/jobUpdateNotice";
import { logError } from "@/lib/logError";
import { isWaGovSender } from "@/lib/odhhFormGate";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";
import { readReplyMeeting } from "@/lib/replyMeetingLink";
import type { ReplyMeeting } from "@/lib/replyMeetingLink";
import { isJobContact, planReplyLink, redactMeetingChanges } from "@/lib/replyMeetingLinkPlan";
import { noteOnce, senderTrusted } from "@/lib/stateVoidNotice";

/**
 * A meeting link in a requester's REPLY, applied to the job with that request number ("Here is the link: https://...zoom.us/j/...").
 * Called for replies by both doors (inboundMail/handle.ts), so the same email means the same thing wherever it arrived.
 *
 *  - Only a trusted sender with authenticated mail may set it: the state, a Washington government address, a registered agency user,
 *    an address on the STATE_VOID_TRUSTED_SENDERS list, or an address the job itself names (its requester or billing contacts).
 *    Anyone else's link is held: the job gets a staff-only note and the admins a notification, and nothing changes.
 *  - Fill-only: a job that already has a meeting link keeps it (a different link is reported to staff).
 *  - The booked interpreters get the usual "job updated" notice (their activity log names the change but never copies the link).
 *
 * Never throws (the email is already stored). HIPAA: the link is never logged, only its host name. SERVER ONLY.
 */

export type ReplyLinkOutcome = "link_applied" | "link_held" | "link_kept" | "link_review";

export interface ReplyLinkInput {
  srn: string;
  senderEmail: string;
  bodyText: string;
  /** The mail passed SES's DKIM/DMARC check, or came through the API-key-protected intake route. */
  authenticated: boolean;
  /** The email's Message-ID, or the fingerprint that stands in for it: one note per email, so a redelivery adds nothing. */
  messageId: string;
}

export interface ReplyLinkResult {
  outcome: ReplyLinkOutcome;
  requestId: string;
}

const isClosed = (status: string): boolean => /^cancell?ed$/i.test(status.trim());
const tagOf = (messageId: string): string => createHash("sha256").update(messageId).digest("hex").slice(0, 8);

function refresh(requestId: string): void {
  try {
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/requests");
    revalidatePath("/jobs");
  } catch {
    // Outside a request (a script, a test): there is no page cache to refresh.
  }
}

const hold = (requestId: string, tag: string, message: string, title: string): Promise<void> =>
  noteOnce(requestId, `reply_link_note:${tag}`, message, title, "An email reply has a meeting link that was not applied. Open the request to check it.");

export async function applyReplyMeetingLink(input: ReplyLinkInput): Promise<ReplyLinkResult | null> {
  try {
    const read = readReplyMeeting(input.bodyText);
    if (read.kind === "none") return null;
    const jobs = await db
      .select({ id: requests.id, status: requests.status, title: requests.title, data: requests.data })
      .from(requests)
      .where(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, input.srn))
      .orderBy(desc(requests.updatedAt));
    const job = jobs.find((row) => !isClosed(row.status));
    if (!job) return null;
    const tag = tagOf(input.messageId);

    if (read.kind === "ambiguous") {
      await hold(job.id, tag, "A reply has more than one meeting link, so none was applied. Check the Inbox and add the right one.", "A reply has several meeting links");
      return { outcome: "link_review", requestId: job.id };
    }
    const meeting = read.meeting;
    const data = (job.data ?? {}) as Record<string, unknown>;
    const trusted = input.authenticated && (isJobContact(data, input.senderEmail) || isWaGovSender(input.senderEmail) || (await senderTrusted(input.senderEmail)));
    if (!trusted) {
      await hold(job.id, tag, `A reply from a sender that could not be verified has a meeting link (${meeting.host}). Nothing was changed. Check the Inbox and add the link on the job if it is right.`, "A reply has a meeting link to check");
      return { outcome: "link_held", requestId: job.id };
    }
    return await applyTrusted(job.id, job.title, meeting, tag);
  } catch (error) {
    logError("Reply meeting link", error);
    return null;
  }
}

async function applyTrusted(requestId: string, title: string | null, meeting: ReplyMeeting, tag: string): Promise<ReplyLinkResult> {
  const done = await db.transaction(async (tx) => {
    const locked = await lockRequestForPosition(tx, requestId);
    if (!locked || isClosed(locked.status)) return null;
    const plan = planReplyLink(locked.data, meeting);
    if (plan.kind !== "apply") return { plan };
    const before = { id: requestId, title, createdAt: locked.createdAt, data: locked.data };
    const notice = await planEditNotice(before, { ...before, data: plan.data });
    const flag = detailsUpdateFlag(notice);
    const [updated] = await tx.update(requests).set({ data: (flag ? { ...plan.data, detailsUpdate: flag } : plan.data) as RequestData, updatedAt: new Date() }).where(eq(requests.id, requestId)).returning();
    return { plan, notice, updated };
  });
  if (!done) return { outcome: "link_kept", requestId };

  switch (done.plan.kind) {
    case "same":
      return { outcome: "link_kept", requestId };
    case "different":
      await hold(requestId, tag, `A reply has a different meeting link (${meeting.host}) from the one on this job. The link on the job was kept. Check the Inbox.`, "A reply has a different meeting link");
      return { outcome: "link_kept", requestId };
    case "not_virtual":
      await hold(requestId, tag, `A reply has a meeting link (${meeting.host}), but this job is not marked virtual. Nothing was changed. Check the Inbox.`, "A reply has a meeting link to check");
      return { outcome: "link_review", requestId };
    default:
      break;
  }
  await logActivity({ requestId, kind: "meeting_link_from_reply", audience: "agency", message: `Meeting link added from an email reply (${meeting.host}).`, actorLabel: "Email intake" });
  if (done.notice && done.updated && done.notice.booked.length > 0) {
    await announceEdit(done.updated, { ...done.notice, changes: redactMeetingChanges(done.notice.changes) }, "Email intake");
  }
  refresh(requestId);
  return { outcome: "link_applied", requestId };
}
