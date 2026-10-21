import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ClarificationButton } from "@/components/jobDetails/ClarificationButton";
import { ActivityLog } from "@/components/requests/ActivityLog";
import { AgencyMessageList } from "@/components/jobDetails/AgencyMessageList";
import { GiveBackButton } from "@/components/jobDetails/GiveBackButton";
import { writeAuditLog } from "@/lib/audit";
import { resolveJobDetailsLink } from "@/lib/jobDetailsAccess";
import { logError } from "@/lib/logError";
import { listActivityForInterpreter, listAgencyMessages } from "@/lib/requestActivity";
import type { ActivityItem, AgencyMessage } from "@/lib/requestActivity";
import { formatFileSize } from "@/lib/validation/file";

// Private page: keep it out of search engines and never send its URL (which holds the token) as a referrer.
export const metadata: Metadata = { title: "Job details | terpDESK", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6">
    <dt className="text-[13px] text-[var(--sage)]">{label}</dt>
    <dd className="text-[14px] font-medium text-[var(--ink)] sm:text-right break-words">{children}</dd>
  </div>
);

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-6">
    <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">{title}</h2>
    {children}
  </section>
);

const MESSAGES = {
  invalid: "This link isn't valid or has expired. Sign in to terpDESK, or contact the agency for a new link.",
  not_booked: "This job is no longer booked to you, so its details aren't available. Contact the agency if this is a mistake.",
} as const;

/** Only http(s) meeting links become clickable, so a stored "javascript:" value can never run. */
const safeHref = (url: string): string | null => (/^https?:\/\//i.test(url) ? url : null);

/**
 * Full job details for a booked interpreter, opened from the booking confirmation email. No sign-in is needed (shadow
 * interpreters have no account), so the signed link plus a live "still booked" check is the authorization.
 */
export default async function JobDetailsPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  let access: Awaited<ReturnType<typeof resolveJobDetailsLink>>;
  try {
    access = await resolveJobDetailsLink(token);
  } catch (err) {
    logError("JobDetailsPage", err);
    access = { ok: false, reason: "invalid" };
  }

  let activity: ActivityItem[] = [];
  let messages: AgencyMessage[] = [];
  let canGiveBack = false;
  if (access.ok) {
    // Only messages addressed to THIS interpreter (on a team job, never the other interpreter's).
    messages = await listAgencyMessages(access.requestId, access.interpreterId).catch((err: unknown) => {
      logError("JobDetailsPage.messages", err);
      return [];
    });
    canGiveBack = Boolean(access.startsAt && new Date(access.startsAt).getTime() > Date.now());
    await writeAuditLog({ action: "job_details_viewed", details: `requestId=${access.requestId}; interpreterId=${access.interpreterId}` });
    // Only shared entries (job changes, cancellation) and this interpreter's own booking events; never other interpreters'.
    activity = await listActivityForInterpreter(access.requestId, access.interpreterId).catch((err: unknown) => {
      logError("JobDetailsPage.activity", err);
      return [];
    });
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--canvas)] px-4 py-10 font-sans text-[var(--ink)]">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex justify-center"><Logo /></div>

        {!access.ok ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            {MESSAGES[access.reason]}{" "}
            <Link href="/login" className="font-medium underline underline-offset-4">Sign in</Link>
          </div>
        ) : (
          <>
            <div className="space-y-1 text-center">
              <h1 className="text-[24px] font-semibold tracking-tight">{access.details.title}</h1>
              <p className="text-[14px] text-[var(--sage)]">Booking {access.details.reference} · Please don&apos;t share this page.</p>
            </div>

            {messages.length > 0 && (
              <Card title="Messages from the agency">
                <AgencyMessageList messages={messages} timeZone={access.details.timeZone} />
              </Card>
            )}

            <Card title="Booking">
              <dl>
                <Row label="Date">{access.details.dateLabel}</Row>
                <Row label="Time">{access.details.timeLabel}</Row>
                <Row label="Format">{access.details.format}</Row>
                <Row label="Setting">{access.details.setting}</Row>
                <Row label="Role">{access.details.role}</Row>
                <Row label="Program">{access.details.program}</Row>
              </dl>
            </Card>

            {access.details.location && (
              <Card title="Location">
                <dl>
                  {access.details.location.venue && <Row label="Venue">{access.details.location.venue}</Row>}
                  <Row label="Address">{access.details.location.address || "Ask the agency"}</Row>
                  {access.details.location.building && <Row label="Building / room">{access.details.location.building}</Row>}
                  {access.details.location.entrance && <Row label="Entrance">{access.details.location.entrance}</Row>}
                  {access.details.location.parking && <Row label="Parking">{access.details.location.parking}</Row>}
                  {access.details.location.contact && (
                    <Row label="On-site contact">
                      {access.details.location.contact}
                      {access.details.location.contactMethod ? ` · ${access.details.location.contactMethod}` : ""}
                    </Row>
                  )}
                </dl>
              </Card>
            )}

            {access.details.virtual && (
              <Card title="Virtual meeting">
                <dl>
                  {access.details.virtual.platform && <Row label="Platform">{access.details.virtual.platform}</Row>}
                  <Row label="Meeting link">
                    {safeHref(access.details.virtual.meetingLink) ? (
                      <a href={access.details.virtual.meetingLink} target="_blank" rel="noopener noreferrer" className="text-[#0B3B32] underline">
                        Join meeting
                      </a>
                    ) : (
                      access.details.virtual.meetingLink || "Ask the agency"
                    )}
                  </Row>
                  {access.details.virtual.meetingId && <Row label="Meeting ID">{access.details.virtual.meetingId}</Row>}
                  {access.details.virtual.passcode && <Row label="Passcode">{access.details.virtual.passcode}</Row>}
                  {access.details.virtual.instructions && <Row label="Instructions">{access.details.virtual.instructions}</Row>}
                </dl>
              </Card>
            )}

            <Card title="Preparation notes">
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700">
                {access.details.prepNotes || "No preparation notes for this job."}
              </p>
            </Card>

            <Card title="Prep materials">
              {access.files.length === 0 ? (
                <p className="text-[14px] text-gray-600">No prep materials have been shared for this job.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {access.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                      <a
                        href={`/api/job-details/files/${f.id}?token=${encodeURIComponent(token)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate text-[14px] font-medium text-[#0B3B32] underline-offset-4 hover:underline"
                      >
                        {f.fileName}
                      </a>
                      <span className="shrink-0 text-xs text-gray-500">{formatFileSize(f.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[12px] text-gray-500">Prep materials are also available in the terpDESK app under Prep.</p>
            </Card>

            <Card title="Activity">
              <p className="mb-4 text-[13px] text-[var(--sage)]">Every change the agency makes to this booking, newest first.</p>
              <ActivityLog items={activity} timeZone={access.details.timeZone} emptyText="No changes have been recorded for this booking." />
            </Card>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
              <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Something unclear?</h2>
              <p className="mb-4 text-[13px] text-[var(--sage)]">Ask the agency a short question about this booking.</p>
              <ClarificationButton target={{ kind: "link", token }} />
            </section>

            {canGiveBack && (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Can&apos;t make it?</h2>
                <p className="mb-4 text-[13px] text-[var(--sage)]">Give the assignment back so the agency can find a replacement. Only possible before it starts.</p>
                <GiveBackButton token={token} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
