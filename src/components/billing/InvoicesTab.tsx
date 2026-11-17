import { AttentionList } from "@/components/billing/AttentionList";
import { ExportLink } from "@/components/billing/ExportLink";
import { InvoiceJob } from "@/components/billing/InvoiceJob";
import type { AttentionItem, InvoiceGroup } from "@/lib/billing/ledger";
import { formatCents } from "@/lib/billing/money";
import type { BillingSettings } from "@/lib/billing/types";

const NOTE: Record<InvoiceGroup["category"], string> = {
  state: "Interpreter's State or King County rate · 1.5 hr minimum · +0.5 hr base · $75 vendor fee per interpreter",
  hca: "Entered in ProviderOne · 1.5 hr minimum · +0.5 hr base · $75 vendor fee per interpreter",
  non_state: "Organization's rate · 2 hr minimum, then rounded up · no vendor fee",
};

/** Client and State invoicing for the pay period: State (ODHH), Apple Health (ProviderOne), then each organization. */
export function InvoicesTab({ groups, attention, settings, periodId }: { groups: InvoiceGroup[]; attention: AttentionItem[]; settings: BillingSettings; periodId: string }) {
  return (
    <section className="space-y-4" aria-label="Invoicing">
      <AttentionList items={attention} />
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-[var(--sage)]">Nothing to invoice in this pay period yet.</p>
      ) : (
        groups.map((g) => (
          <details key={g.key} open className="rounded-2xl border border-gray-200 bg-white" data-invoice-group={g.label}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span>
                <span className="block font-semibold text-[var(--ink)]">{g.label}</span>
                <span className="block text-xs text-[var(--sage)]">
                  {g.jobs.length} job{g.jobs.length === 1 ? "" : "s"} · {NOTE[g.category]}
                </span>
              </span>
              <span className="text-lg font-semibold tabular-nums text-[var(--ink)]">{formatCents(g.totalCents)}</span>
            </summary>
            <div className="border-t border-gray-100">
              {g.jobs.map((ledger) => (
                <InvoiceJob key={ledger.job.requestId} ledger={ledger} settings={settings} />
              ))}
            </div>
          </details>
        ))
      )}
      {groups.length > 0 && (
        <div className="flex justify-end">
          <ExportLink kind="invoices" periodId={periodId} label="Download invoices CSV (includes ProviderOne fields)" />
        </div>
      )}
    </section>
  );
}
