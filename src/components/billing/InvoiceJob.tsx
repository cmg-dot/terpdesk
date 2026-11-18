"use client";

import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { OutcomeBadge } from "@/components/billing/CategoryBadge";
import { CancellationControl, KingCountyControl } from "@/components/billing/JobOverrides";
import { LineTable } from "@/components/billing/LineTable";
import { Total } from "@/components/billing/Money";
import { ProviderOneCard } from "@/components/billing/ProviderOneCard";
import { Expandable } from "@/components/ui/Expandable";
import { isStateRules } from "@/lib/billing/categories";
import { dayLabel, noticeLabel } from "@/lib/billing/format";
import type { BillingSettings, JobLedger } from "@/lib/billing/types";
import { verificationPdfUrl } from "@/lib/verificationPdf/url";

interface Props {
  ledger: JobLedger;
  settings: BillingSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One job on an invoice. Folded: date, reference, place, how it ended and its emerald total. Opened: the overrides staff may need
 * (cancellation billing, King County), each interpreter's ProviderOne entry (HCA) and lines, and the Verification PDFs.
 */
export function InvoiceJob({ ledger, settings, open, onOpenChange }: Props) {
  const { job } = ledger;
  const cancelled = job.outcome !== "completed";
  const dayMinutes = settings.businessDayEndMinute - settings.businessDayStartMinute;
  const ruleSays = `${job.ruleOutcome === "cancelled_billable" ? "billable" : "not billable"}, ${noticeLabel(job.noticeBusinessMinutes ?? 0, dayMinutes)} notice`;
  const kingCountyJob = isStateRules(job.category) && job.inPerson;

  return (
    <Expandable
      name="invoice-job"
      open={open}
      onOpenChange={onOpenChange}
      headerClassName="px-5 py-3"
      bodyClassName="space-y-3 px-5 pb-5"
      header={
        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5" data-invoice-job={job.reference}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="w-24 shrink-0 font-medium tabular-nums text-[var(--ink)]">{dayLabel(job.serviceDate)}</span>
            <span className="font-medium text-[var(--forest)]">{job.reference}</span>
            <span className="text-[var(--sage)]">· {job.placeLabel}</span>
            {job.kingCounty.value && kingCountyJob && <span className="rounded-full bg-[var(--tint)] px-2.5 py-0.5 text-xs font-medium text-[var(--tint-ink)]">King County</span>}
            <OutcomeBadge outcome={job.outcome} />
          </span>
          <Total cents={ledger.billTotalCents} size="lg" />
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {cancelled && <CancellationControl requestId={job.requestId} current={job.outcome === "cancelled_billable" ? "billable" : "not_billable"} source={job.outcomeSource === "staff" ? "staff" : "auto"} ruleSays={ruleSays} />}
        {kingCountyJob && <KingCountyControl requestId={job.requestId} value={job.kingCounty.value} source={job.kingCounty.source} matched={job.kingCounty.matched} />}
        <Link href={`/requests/${job.requestId}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--forest)] hover:underline">
          Open request
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
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
    </Expandable>
  );
}
