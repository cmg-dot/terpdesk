import { AttentionList } from "@/components/billing/AttentionList";
import { ExportLink } from "@/components/billing/ExportLink";
import { InvoiceGroupCard } from "@/components/billing/InvoiceGroupCard";
import type { AttentionItem, InvoiceGroup } from "@/lib/billing/ledger";
import type { BillingSettings } from "@/lib/billing/types";

/** Client and State invoicing for the pay period: State (ODHH), Apple Health (ProviderOne), then each organization. */
export function InvoicesTab({ groups, attention, settings, periodId }: { groups: InvoiceGroup[]; attention: AttentionItem[]; settings: BillingSettings; periodId: string }) {
  return (
    <section className="space-y-4" aria-label="Invoicing">
      <AttentionList items={attention} />
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-[var(--sage)]">Nothing to invoice in this pay period yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <InvoiceGroupCard key={g.key} group={g} settings={settings} />
          ))}
        </div>
      )}
      {groups.length > 0 && (
        <div className="flex justify-end">
          <ExportLink kind="invoices" periodId={periodId} label="Download invoices CSV (includes ProviderOne fields)" />
        </div>
      )}
    </section>
  );
}
