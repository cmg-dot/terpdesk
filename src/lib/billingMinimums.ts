import { isOdhhProgram, isStateProgram } from "@/lib/stateJob";

/**
 * Billing minimums: a job is billed for at least 1.5 hours (State) or 2 hours (Non-state), however short the service.
 * Pure and shared by the hours-review screen and (later) invoices / exports.
 *
 * The minimum is a BILLING figure only. The hours the interpreter reported stay as they are (timesheets.billable_hours
 * still holds the worked time, and it is what the interpreter's approval email quotes), so the minimum is applied here,
 * when billable time is worked out, never written over the worked hours.
 */

export type BillingTier = "state" | "non_state";

export const STATE_MINIMUM_HOURS = 1.5;
export const NON_STATE_MINIMUM_HOURS = 2;

export const BILLING_MINIMUM_HOURS: Record<BillingTier, number> = { state: STATE_MINIMUM_HOURS, non_state: NON_STATE_MINIMUM_HOURS };
export const BILLING_TIER_LABEL: Record<BillingTier, string> = { state: "State", non_state: "Non-state" };

/** What decides the tier. `isOdhh` is for records that only carry that flag (the hours-review records). */
export interface BillingTierSource {
  /** requests.data.intake.program */
  program?: string | null;
  /** requests.is_state_job */
  isStateJob?: boolean | null;
  isOdhh?: boolean | null;
}

/**
 * State = ODHH, or a request flagged as a state job. Non-state = everything else: HCA / Apple Health and private jobs.
 *
 * NOTE: `requests.is_state_job` is also true for Apple Health (HCA) jobs, because they are routed to a state portal for
 * their hours. They are billed at the NON-state minimum here, so the program is checked before the flag.
 *
 * TODO(bulk import): once the imported jobs carry a definitive State / Non-state value (a payer or client type), map it
 * here. This function is the only place that decides the tier.
 */
export function billingTierOf(job: BillingTierSource): BillingTier {
  if (job.isOdhh === true || isOdhhProgram(job.program)) return "state";
  if (isStateProgram(job.program)) return "non_state";
  return job.isStateJob === true ? "state" : "non_state";
}

export interface BillableTime {
  tier: BillingTier;
  workedMinutes: number;
  billableMinutes: number;
  /** Billable time in hours, to two decimals. */
  billableHours: number;
  minimumHours: number;
  /** True only when the minimum raised the billable time above the time worked. */
  minimumApplied: boolean;
}

/**
 * The time to bill for `workedMinutes` of service: the worked time, but never less than the tier's minimum.
 * No time worked (a service that did not happen) bills nothing: the minimum is for service that was performed.
 */
export function applyBillingMinimum(workedMinutes: number, tier: BillingTier): BillableTime {
  const worked = Number.isFinite(workedMinutes) ? Math.max(0, workedMinutes) : 0;
  const minimumMinutes = BILLING_MINIMUM_HOURS[tier] * 60;
  const billableMinutes = worked === 0 ? 0 : Math.max(worked, minimumMinutes);
  return {
    tier,
    workedMinutes: worked,
    billableMinutes,
    billableHours: Math.round((billableMinutes / 60) * 100) / 100,
    minimumHours: BILLING_MINIMUM_HOURS[tier],
    minimumApplied: worked > 0 && worked < minimumMinutes,
  };
}

/** "1.5", "2", "2.25": at most two decimals, no trailing zeros. */
export const formatHours = (hours: number): string => String(Math.round(hours * 100) / 100);
