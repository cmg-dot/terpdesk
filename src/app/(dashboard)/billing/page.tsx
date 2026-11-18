import { BillingHeader, parseTab } from "@/components/billing/BillingHeader";
import { BillingDeferred, BillingNotReady } from "@/components/billing/BillingNotices";
import { InvoicesTab } from "@/components/billing/InvoicesTab";
import { PayrollTab } from "@/components/billing/PayrollTab";
import { RulesTab } from "@/components/billing/RulesTab";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { requireRole } from "@/lib/auth/guards";
import { BILLING_ENABLED } from "@/lib/billing/enabled";
import { loadClientTerms, loadInterpreterRates } from "@/lib/billing/rulesData";
import { loadBillingView } from "@/lib/billing/view";

export const metadata = { title: "Billing | terpDESK" };
export const dynamic = "force-dynamic";

/**
 * Billing: interpreter payroll and client / State invoicing for one semi-monthly pay period, and the rates and rules behind them.
 * Read straight from the database on every visit (approved hours, bookings, cancellations, rates), so it always matches Hours review.
 * Switched off (the old placeholder) wherever billing is not enabled.
 */
export default async function BillingPage({ searchParams }: { searchParams: { tab?: string; period?: string } }) {
  if (!BILLING_ENABLED) return <BillingDeferred />;
  // The middleware already limits /billing to agency staff; this is the server-side check for the data.
  await requireRole("agency");
  const now = new Date();
  const view = await loadBillingView(DEFAULT_AGENCY_ID, searchParams.period, now);
  if (!view.ready) return <BillingNotReady />;

  const tab = parseTab(searchParams.tab);
  const periods = view.periods.some((p) => p.id === view.period.id) ? view.periods : [view.period, ...view.periods];
  const [clients, interpreters] = tab === "rules" ? await Promise.all([loadClientTerms(), loadInterpreterRates(DEFAULT_AGENCY_ID)]) : [[], []];

  return (
    // The dashboard layout already pads the sides and the bottom (and clears the phone's bottom nav), so only the width and rhythm are set here.
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pt-2 antialiased">
      <BillingHeader tab={tab} period={view.period} periods={periods} totals={view.totals} />
      {tab === "payroll" && <PayrollTab groups={view.payroll} attention={view.attention} periodId={view.period.id} />}
      {tab === "invoices" && <InvoicesTab groups={view.invoices} attention={view.attention} settings={view.settings} periodId={view.period.id} />}
      {tab === "rules" && <RulesTab settings={view.settings} periods={view.savedPeriods} holidays={view.holidays} clients={clients} interpreters={interpreters} now={now} />}
    </div>
  );
}
