"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { useInboxEmailContext } from "@/hooks/useInboxEmailContext";
import { parsedRowsFor } from "@/lib/inboxParsedRows";
import type { InboxCategory } from "@/lib/inboxCategory";
import { getIanaZone } from "@/utils/timezone";
import type { InboxEmail, InboxEmailContext } from "@/types/inbox";

const Card = ({ title, children, id }: { title: string; children: ReactNode; id: string }) => (
  <section data-parsed-card={id} className="rounded-2xl border border-gray-200 bg-white">
    <h3 className="border-b border-gray-100 px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--forest)] sm:px-5">{title}</h3>
    <div className="px-4 py-2 sm:px-5">{children}</div>
  </section>
);

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-1 gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
    <dt className="text-sm text-[var(--sage)]">{label}</dt>
    <dd className={`min-w-0 break-words text-sm ${value ? "font-medium text-[var(--ink)]" : "italic text-gray-400"}`}>{value || "Not found in the email"}</dd>
  </div>
);

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  submitted: "bg-amber-50 text-amber-800 border-amber-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};
const pill = (status: string) => `inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200"}`;
const stamp = (iso: string | null): string => (iso ? formatInTimeZone(new Date(iso), getIanaZone(), "MMM d, h:mm a") : "—");

function MatchedJob({ context }: { context: InboxEmailContext }) {
  if (!context.srn) return <p className="py-3 text-sm italic text-gray-400">No state request number was found in this email.</p>;
  if (!context.job) {
    return <p className="py-3 text-sm text-[var(--sage)]">No request has SRN #{context.srn} yet. One is created when the state&apos;s request form for it arrives.</p>;
  }
  const { job } = context;
  return (
    <dl>
      <Row label="Request" value={<Link href={`/requests/${job.id}`} data-parsed-job-link className="text-blue-700 underline underline-offset-2 hover:text-blue-900">{job.title}</Link>} />
      <Row label="Status" value={<span className={pill(job.status)}>{job.status}</span>} />
      {job.voidedAt && <Row label="Voided" value={`${stamp(job.voidedAt)}${job.voidedKind ? ` · ${job.voidedKind.replace(/_/g, " ")}` : ""}`} />}
    </dl>
  );
}

/**
 * The "Parsed Data" tab: the request this email belongs to (by its SRN), what the intake parser reads from the message, and the
 * request's timesheets. The match and the timesheets come from a read-only lookup; the parsed rows are computed here.
 */
export function InboxParsedData({ email, category }: { email: InboxEmail; category: InboxCategory }) {
  const { isLoading, context, error } = useInboxEmailContext(email.id);
  const parsed = parsedRowsFor(category, email.subject, email.bodyText);
  return (
    <div className="space-y-4" data-inbox-parsed>
      <Card id="job" title="Matched request">
        {isLoading ? (
          <div aria-busy="true" aria-label="Looking up the request" className="space-y-2 py-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
          </div>
        ) : error ? (
          <p role="alert" className="py-3 text-sm text-amber-900">{error}</p>
        ) : context ? (
          <MatchedJob context={context} />
        ) : null}
      </Card>

      {parsed ? (
        <Card id="intake" title={parsed.title}>
          <dl>{parsed.rows.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}</dl>
        </Card>
      ) : (
        <Card id="intake" title="Intake data">
          <p className="py-3 text-sm text-[var(--sage)]">
            {category === "void" || category === "notice" ? "This is a notice about an existing request. Its details are on the matched request above." : "This message does not contain a request or a report to read. Its text is on the Raw Message tab."}
          </p>
        </Card>
      )}

      {context && context.timesheets.length > 0 && (
        <Card id="timesheets" title={`Timesheets (${context.timesheets.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-[var(--sage)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Position</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Actual time</th>
                  <th className="py-2 pr-3 font-medium">Miles</th>
                  <th className="py-2 font-medium">Signature</th>
                </tr>
              </thead>
              <tbody>
                {context.timesheets.map((t, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2.5 pr-3">{t.position ?? "—"}</td>
                    <td className="py-2.5 pr-3"><span className={pill(t.status)}>{t.status}</span></td>
                    <td className="py-2.5 pr-3">{stamp(t.actualStart)} – {stamp(t.actualEnd)}</td>
                    <td className="py-2.5 pr-3">{t.miles ?? "—"}</td>
                    <td className="py-2.5">{t.hasSignature ? "On file" : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
