import { revalidatePath } from "next/cache";
import { contentFingerprint, insertOdhhRequestOnce } from "@/lib/odhhDedupe";
import { buildDraftData, draftTitle } from "@/lib/odhhDraft";
import { jobSchedule, normalizeEmailText, parseIntakeEmail, parseWarnings, sanitizeSrn } from "@/lib/odhhEmailParser";
import type { ParsedIntakeEmail } from "@/lib/odhhEmailParser";
import { enrichRequestFromForm } from "@/lib/odhhEnrichStore";
import { stateNoticeKind } from "@/lib/odhhNotice";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { seedClientQuietly } from "@/lib/clientUpsert";
import { logActivity } from "@/lib/requestActivity";
import type { RequestData } from "@/db/schema";

/**
 * A state request email ("job offer"), turned into a job or applied to the job that already has its SRN. The one place this
 * happens: /api/intake (the AWS Lambda) and the Inbox (mail forwarded to the agency address) both call it, so a form is read
 * and applied the same way whichever door it came through.
 *
 *  - new SRN: a draft job is created (once: AWS retries and repeat emails never make a second one);
 *  - known SRN: the job's BLANK fields are filled (see odhhEnrich.ts). Nothing already filled is changed, and booked
 *    interpreters, offers and the schedule are never touched.
 *
 * SERVER ONLY. HIPAA: logs carry counts and fixed labels only, never a value from the email.
 */

export interface JobEmailInput {
  /** The sender's address. */
  email: string;
  subject: string;
  rawContent: string;
  /** An SRN the sender already extracted (the Lambda's), used only when the email text has none. */
  hintedSrn?: string | null;
  /**
   * For mail that reached the Inbox rather than the API-key-protected route: act only on an email that is plainly the state's
   * form (an SRN, and the state's portal link for that same SRN). Anything else is left in the Inbox for staff.
   */
  strict?: boolean;
}

export type JobEmailOutcome =
  | { outcome: "not_a_job"; warnings: string[] }
  | { outcome: "duplicate"; id: string; filled: string[] }
  | { outcome: "created"; id: string; parsed: ParsedIntakeEmail; warnings: string[]; hasRequestor: boolean };

/** The state's portal link for this very SRN: every form it sends has one ("...servicerequest.aspx?id=202781026"). */
export const carriesStatePortalLink = (rawContent: string, srn: string): boolean =>
  new RegExp(`fortress\\.wa\\.gov/dshs/odhhapps/\\S*servicerequest\\.aspx\\?id=${srn}\\b`, "i").test(normalizeEmailText(rawContent));

export async function processJobOfferEmail(input: JobEmailInput): Promise<JobEmailOutcome> {
  const { email, subject, rawContent } = input;
  const receivedAt = new Date().toISOString();
  const parsed = parseIntakeEmail(rawContent, subject);
  const srn = parsed.srn ?? sanitizeSrn(input.hintedSrn?.trim() || undefined);
  const warnings = parseWarnings(parsed);

  // A state NOTICE (booking confirmation, "now in process", reassignment, cancellation, hours report) names the request but is not
  // the form: it states no appointment date or times, so it never creates a job and never fills one in.
  const notice = stateNoticeKind(subject, rawContent, Boolean(parsed.isoDate));
  if (notice) return { outcome: "not_a_job", warnings: [...warnings, "A state notice, not a request form"] };

  if (input.strict && (!srn || !carriesStatePortalLink(rawContent, srn))) {
    return { outcome: "not_a_job", warnings: [...warnings, "Not recognised as the state's request form"] };
  }

  // Appointment start/end from the email's own Pacific wall-clock date and times. Nothing is guessed: without an anchor
  // line and a readable date, start and end, no job is created and the email stays in the Inbox.
  const schedule = jobSchedule(rawContent, parsed, warnings);
  if (!schedule) return { outcome: "not_a_job", warnings };
  const { startsAt, endsAt } = schedule;

  const extras = parseFormExtras(rawContent);
  const contentHash = contentFingerprint(rawContent);
  const requestData: RequestData = buildDraftData({
    parsed,
    extras,
    srn,
    fromEmail: email,
    subject,
    rawContent,
    contentHash,
    receivedAt,
    warnings,
    startsAt,
    endsAt,
  });

  // Saved at most once per SRN: AWS retries and repeat emails must not create a second job.
  const inserted = await insertOdhhRequestOnce(
    {
      title: draftTitle({ srn, parsed, subject, fromEmail: email }),
      status: "draft",
      // This parser only handles ODHH emails (program is always WA ODHH), so these are always state jobs.
      isStateJob: true,
      data: requestData,
      // The app reads createdAt as the appointment start (see createRequest). Always the parsed start, never "now".
      createdAt: startsAt,
    },
    { srn, contentHash },
  );

  // The organization the form bills (DVR, Seattle Children's, ...) joins the Clients list, with its billing contact. Never
  // throws: a Clients problem must not fail an intake whose job is already saved.
  if (extras.billingOrganization) {
    const seeded = await seedClientQuietly({
      organization: extras.billingOrganization,
      billingContact: { name: extras.billingContactName, email: extras.billingContactEmail, phone: extras.billingContactPhone },
    });
    if (seeded && (seeded.created || seeded.contactAdded)) revalidatePath("/clients");
  }

  if (inserted.duplicate) {
    // The email may be the state's original form for a job imported from a spreadsheet: fill that job's blanks.
    const enriched = await enrichRequestFromForm(inserted.id, requestData);
    if (enriched?.applied) {
      revalidatePath("/requests");
      revalidatePath(`/requests/${inserted.id}`);
      revalidatePath("/calendar");
    } else {
      await logActivity({ requestId: inserted.id, kind: "duplicate_email_ignored", audience: "agency", message: "A repeat of this request's email was received and ignored", actorLabel: "Email intake" });
    }
    return { outcome: "duplicate", id: inserted.id, filled: enriched?.applied ? enriched.plan.changed : [] };
  }

  await logActivity({ requestId: inserted.id, kind: "created", audience: "shared", message: "Request created", actorLabel: "Email intake" });
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  const hasRequestor = Boolean(parsed.requestorName || parsed.requestorPhone || parsed.requestorEmail);
  return { outcome: "created", id: inserted.id, parsed, warnings, hasRequestor };
}
