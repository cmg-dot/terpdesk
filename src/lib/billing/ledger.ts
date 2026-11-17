import { CATEGORY_LABEL } from "@/lib/billing/categories";
import { sumCents } from "@/lib/billing/money";
import type { BillingCategory, Cents, JobLedger, JobOutcome, LineItem, PositionLedger } from "@/lib/billing/types";

/** The two ledgers' groupings and the "needs attention" list, from computed job ledgers. Pure. */

export const OUTCOME_LABEL: Record<JobOutcome, string> = {
  completed: "Completed",
  cancelled_billable: "Cancelled · billable",
  cancelled_not_billable: "Cancelled · not billable",
};

export interface PayrollRow {
  requestId: string;
  reference: string;
  serviceDate: string;
  placeLabel: string;
  category: BillingCategory;
  outcome: JobOutcome;
  positionId: number;
  lines: LineItem[];
  totalCents: Cents;
}

/** One interpreter's pay for the period. Never carries client names, dates of birth or any other PHI. */
export interface PayrollGroup {
  interpreterId: string;
  interpreterName: string;
  rows: PayrollRow[];
  totalCents: Cents;
}

export function payrollGroups(ledgers: readonly JobLedger[]): PayrollGroup[] {
  const groups = new Map<string, PayrollGroup>();
  for (const ledger of ledgers) {
    for (const position of ledger.positions) {
      // A non-billable cancellation pays nothing: it is not a payroll row (its vendor fee is on the invoice side).
      if (!position.included || !position.interpreterId || position.pay.length === 0) continue;
      const group = groups.get(position.interpreterId) ?? { interpreterId: position.interpreterId, interpreterName: position.interpreterName, rows: [], totalCents: 0 };
      group.rows.push({
        requestId: ledger.job.requestId,
        reference: ledger.job.reference,
        serviceDate: ledger.job.serviceDate,
        placeLabel: ledger.job.placeLabel,
        category: ledger.job.category,
        outcome: ledger.job.outcome,
        positionId: position.positionId,
        lines: position.pay,
        totalCents: position.payTotalCents,
      });
      group.totalCents += position.payTotalCents;
      groups.set(position.interpreterId, group);
    }
  }
  const out = Array.from(groups.values());
  for (const g of out) g.rows.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.reference.localeCompare(b.reference));
  return out.sort((a, b) => a.interpreterName.localeCompare(b.interpreterName));
}

export interface InvoiceGroup {
  /** "state", "hca", "client:<id>" or "client:none". */
  key: string;
  label: string;
  category: BillingCategory;
  jobs: JobLedger[];
  totalCents: Cents;
}

const hasBilling = (ledger: JobLedger): boolean => ledger.positions.some((p) => p.included && p.bill.length > 0);

export function invoiceGroups(ledgers: readonly JobLedger[]): InvoiceGroup[] {
  const groups = new Map<string, InvoiceGroup>();
  for (const ledger of ledgers) {
    if (!hasBilling(ledger)) continue;
    const { job } = ledger;
    const key = job.category === "non_state" ? `client:${job.client.id ?? "none"}` : job.category;
    const label = job.category === "non_state" ? job.client.name ?? "Organization not matched" : job.category === "hca" ? `${CATEGORY_LABEL.hca} · ProviderOne` : CATEGORY_LABEL.state;
    const group = groups.get(key) ?? { key, label, category: job.category, jobs: [], totalCents: 0 };
    group.jobs.push(ledger);
    group.totalCents += ledger.billTotalCents;
    groups.set(key, group);
  }
  const order: Record<BillingCategory, number> = { state: 0, hca: 1, non_state: 2 };
  const out = Array.from(groups.values());
  for (const g of out) g.jobs.sort((a, b) => a.job.serviceDate.localeCompare(b.job.serviceDate) || a.job.reference.localeCompare(b.job.reference));
  return out.sort((a, b) => order[a.category] - order[b.category] || a.label.localeCompare(b.label));
}

export interface AttentionItem {
  requestId: string;
  reference: string;
  serviceDate: string;
  who: string;
  message: string;
}

/** Positions left out (hours not approved yet) and every warning (a missing rate), one line each. */
export function attentionItems(ledgers: readonly JobLedger[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  const add = (ledger: JobLedger, position: PositionLedger, message: string) =>
    items.push({ requestId: ledger.job.requestId, reference: ledger.job.reference, serviceDate: ledger.job.serviceDate, who: position.interpreterName, message });
  for (const ledger of ledgers) for (const position of ledger.positions) for (const warning of position.warnings) add(ledger, position, warning);
  return items.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
}

export interface LedgerTotals {
  payCents: Cents;
  billCents: Cents;
  jobs: number;
  interpreters: number;
}

export function ledgerTotals(ledgers: readonly JobLedger[]): LedgerTotals {
  const people = new Set<string>();
  for (const l of ledgers) for (const p of l.positions) if (p.included && p.interpreterId) people.add(p.interpreterId);
  return {
    payCents: sumCents(ledgers.map((l) => l.payTotalCents)),
    billCents: sumCents(ledgers.map((l) => l.billTotalCents)),
    jobs: ledgers.filter(hasBilling).length,
    interpreters: people.size,
  };
}
