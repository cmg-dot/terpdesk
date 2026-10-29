import { BILLING_TIER_LABEL, applyBillingMinimum, billingTierOf, formatHours } from "@/lib/billingMinimums";

/** "Billable time" under the service time on an hours-review card: the worked time, raised to the job's billing minimum. */
export function BillableTimeRow({ workedMinutes, isOdhh }: { workedMinutes: number; isOdhh: boolean }) {
  const billable = applyBillingMinimum(workedMinutes, billingTierOf({ isOdhh }));
  const tier = BILLING_TIER_LABEL[billable.tier];
  return (
    <div>
      <div className="text-[var(--sage)] mb-1">Billable time</div>
      <div className="text-[var(--ink)]">{formatHours(billable.billableHours)} hr</div>
      <div className="mt-0.5 text-xs text-[var(--sage)]">
        {billable.workedMinutes === 0
          ? "No service time, so nothing to bill."
          : billable.minimumApplied
            ? `${formatHours(billable.minimumHours)} hr ${tier.toLowerCase()} minimum applied.`
            : `Over the ${formatHours(billable.minimumHours)} hr ${tier.toLowerCase()} minimum.`}
      </div>
    </div>
  );
}
