import Link from "next/link";
import { FileText } from "lucide-react";
import { CancellationControl, KingCountyControl } from "@/components/billing/JobOverrides";
import { LineTable } from "@/components/billing/LineTable";
import { ProviderOneCard } from "@/components/billing/ProviderOneCard";
import { isStateRules } from "@/lib/billing/categories";
import { dayLabel, noticeLabel } from "@/lib/billing/format";
import { OUTCOME_LABEL } from "@/lib/billing/ledger";
import { formatCents } from "@/lib/billing/money";
import type { BillingSettings, JobLedger } from "@/lib/billing/types";
import { verificationPdfUrl } from "@/lib/verificationPdf/url";

/** One job on the invoicing side: what is billed per interpreter, the overrides staff may need, and the Verification PDFs. */
export function InvoiceJob({ ledger, settings }: { ledger: JobLedger; settings: BillingSettings }) {
  const { job } = ledger;
  const cancelled = job.outcome !== "completed";
  const dayMinutes = settings.businessDayEndMinute - settings.businessDayStartMinute;
  const ruleSays = `${job.ruleOutcome === "cancelled_billable" ? "billable" : "not billable"}, ${noticeLabel(job.noticeBusinessMinutes ?? 0, dayMinutes)} notice`;
  return (
    <article className="space-y-3 border-t border-gray-100 px-5 py-4 first:border-t-0" data-invoice-job={job.reference}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium tabular-nums text-[var(--ink)]">{dayLabel(job.serviceDate)}</span>
            <Link href={`/requests/${job.requestId}`} className="text-[var(--forest)] hover:underline">
              {job.reference}
            </Link>
            <span className="text-[var(--sage)]">· {job.placeLabel}</span>
            {cancelled && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${job.outcome === "cancelled_billable" ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"}`}>{OUTCOME_LABEL[job.outcome]}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {cancelled && (
              <CancellationControl
                requestId={job.requestId}
                current={job.outcome === "cancelled_billable" ? "billable" : "not_billable"}
                source={job.outcomeSource === "staff" ? "staff" : "auto"}
                ruleSays={ruleSays}
              />
            )}
            {isStateRules(job.category) && job.inPerson && <KingCountyControl requestId={job.requestId} value={job.kingCounty.value} source={job.kingCounty.source} matched={job.kingCounty.matched} />}
          </div>
        </div>
        <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">{formatCents(ledger.billTotalCents)}</span>
      </div>
      {ledger.positions
        .filter((p) => p.included)
        .map((p) => {
          const facts = job.positions.find((f) => f.positionId === p.positionId);
          return (
            <div key={p.positionId} className="space-y-2 rounded-xl bg-[#F9F9F8] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-[var(--ink)]">{p.interpreterName}</span>
                {facts?.hasVerificationPdf && (
                  <a href={verificationPdfUrl(job.requestId, p.positionId)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--forest)] hover:underline">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Verification PDF
                  </a>
                )}
              </div>
              {job.hca && <ProviderOneCard serviceDate={job.serviceDate} hca={job.hca} position={p} />}
              <LineTable lines={p.bill} total={p.billTotalCents} />
            </div>
          );
        })}
    </article>
  );
}
