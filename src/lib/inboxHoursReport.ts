import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, requests } from "@/db/schema";
import { extractSrn } from "@/lib/inboxSrn";
import { logError } from "@/lib/logError";
import { notifyAgencyAdmins } from "@/lib/notifications";
import { parseServiceVerification } from "@/lib/odhhVerificationParser";

/**
 * An hours report (SLICR / service verification) that reached the Inbox. Its hours are applied by the /api/intake door (the AWS
 * Lambda: serviceVerification.ts), never from here. The Inbox only records what it is, and the job it belongs to, so the row does
 * not look unhandled, and tells staff when no job has its request number (hours for a job terpDESK does not have would otherwise
 * go unnoticed). SERVER ONLY. Never throws. HIPAA: the alert names only the request number, never a person or a time.
 */

export type HoursReportOutcome = "hours_report" | "hours_no_job";

export const HOURS_NO_JOB_TITLE = "Hours report for a job not in terpDESK";

export async function noteInboxHoursReport(subject: string, bodyText: string): Promise<{ srn: string | null; outcome: HoursReportOutcome; requestId: string | null }> {
  const srn = parseServiceVerification(bodyText).srn ?? extractSrn(subject, bodyText);
  try {
    if (srn) {
      const [job] = await db
        .select({ id: requests.id })
        .from(requests)
        .where(sql`${requests.data} #>> '{intake,odhhSrn}' = ${srn}`)
        .orderBy(sql`${requests.canceledAt} is not null`, sql`${requests.updatedAt} desc`)
        .limit(1);
      if (job) return { srn, outcome: "hours_report", requestId: job.id };
    }
    await alertOnce(srn);
  } catch (error) {
    logError("Inbox hours report", error);
  }
  return { srn, outcome: "hours_no_job", requestId: null };
}

/** One alert per request number: a repeat delivery of the same report does not add another. */
async function alertOnce(srn: string | null): Promise<void> {
  const message = srn
    ? `The state sent an hours report for SRN #${srn}, but no job has that request number. Add the job, then record its hours.`
    : "The state sent an hours report whose request number could not be read. Open the Inbox to check it.";
  const [already] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.title, HOURS_NO_JOB_TITLE), eq(notifications.message, message)))
    .limit(1);
  if (already) return;
  await notifyAgencyAdmins({ type: "job", title: HOURS_NO_JOB_TITLE, message, href: "/inbox" });
}
