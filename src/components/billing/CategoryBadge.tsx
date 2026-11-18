import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import type { BillingCategory, JobOutcome, LineKind } from "@/lib/billing/types";

/** The billing pills: who pays, how a cancellation ended, and the two fees. Built on the shared Badge. */

const PAYER: Record<BillingCategory, { label: string; variant: BadgeVariant }> = {
  state: { label: "State · ODHH", variant: "blue" },
  hca: { label: "Apple Health · ProviderOne", variant: "purple" },
  non_state: { label: "Organization", variant: "gray" },
};

export const PayerBadge = ({ category, short = false }: { category: BillingCategory; short?: boolean }) => (
  <Badge variant={PAYER[category].variant} className="billing-badge">
    {short ? { state: "State", hca: "HCA", non_state: "Organization" }[category] : PAYER[category].label}
  </Badge>
);

/** Only cancellations get a badge; a job that happened needs none. */
export const OutcomeBadge = ({ outcome }: { outcome: JobOutcome }) =>
  outcome === "completed" ? null : (
    <Badge variant={outcome === "cancelled_billable" ? "amber" : "gray"} className="billing-badge">
      {outcome === "cancelled_billable" ? "Cancelled · billable" : "Cancelled · not billable"}
    </Badge>
  );

/** The fee lines as pills next to their label: +$10 commercial auto (emerald), the vendor and onsite fees (amber). */
export function FeeBadge({ kind }: { kind: LineKind }) {
  if (kind === "commercial_auto") return <Badge variant="green" className="money-pill">+$10 commercial auto</Badge>;
  if (kind === "vendor_fee") return <Badge variant="amber" className="billing-badge">Vendor fee</Badge>;
  if (kind === "onsite_fee") return <Badge variant="amber" className="billing-badge">Onsite fee</Badge>;
  return null;
}

/** "State 2 · HCA 1": how many of a person's jobs each payer has. */
export function payerSummary(categories: readonly BillingCategory[]): string {
  const counts: Record<BillingCategory, number> = { state: 0, hca: 0, non_state: 0 };
  for (const c of categories) counts[c] += 1;
  return ([["state", "State"], ["hca", "HCA"], ["non_state", "Organization"]] as const)
    .filter(([key]) => counts[key] > 0)
    .map(([key, label]) => `${label} ${counts[key]}`)
    .join(" · ");
}
