import { NON_STATE_MINIMUM_HOURS, STATE_MINIMUM_HOURS } from "@/lib/billingMinimums";
import { isStateRules } from "@/lib/billing/categories";
import { splitTravel } from "@/lib/billing/evening";
import { ceilToStep, minutesAmount, minutesToHours, sumCents, unitsAmount } from "@/lib/billing/money";
import type { BillingSettings, ClientBilling, JobFacts, JobLedger, LineItem, PositionFacts, PositionLedger } from "@/lib/billing/types";

/**
 * Kari's billing rules, for one booked position of one job. Pure: the same facts always give the same lines.
 *
 * State and Apple Health (HCA):
 *  - the interpreter's own rate (King County rate in King County) is both billed and paid;
 *  - service is raised to the 1.5-hour minimum, rounded up to the State step (15 min), and the first hour counts 1.5x: +0.5 hr,
 *    so 1.5 hours worked = 2.0 billed units;
 *  - $75 vendor fee per booked position, cancelled jobs included; $10 onsite fee per position on a completed in-person job, paid
 *    on to the interpreter only with a current commercial auto policy.
 * Non-state: the client's rate is billed (default $95) and the interpreter's Non-state rate paid; 2-hour minimum, then rounded up to
 *   30 minutes (15 for clients set to it); never a vendor fee, onsite fee or 1.5x first hour.
 * Everyone: approved travel at the job's rate (evening minutes at the evening rate when set); approved mileage on completed jobs
 *   only. A billable cancellation pays and bills the scheduled time with the minimum (and the 1.5x) plus submitted travel, never
 *   mileage; a non-billable one pays nothing and bills only a State/HCA vendor fee.
 */

/** The 1.5x first hour, as the half hour it adds. */
export const FIRST_HOUR_ADD_ON_MINUTES = 30;

/** Billed service minutes: the minimum, then rounded up to the step. Nothing worked bills nothing. */
export function billedServiceMinutes(worked: number, job: Pick<JobFacts, "category">, settings: BillingSettings, client: ClientBilling): number {
  const minutes = Math.max(0, Math.round(worked));
  if (minutes === 0) return 0;
  const stateRules = isStateRules(job.category);
  const minimum = (stateRules ? STATE_MINIMUM_HOURS : NON_STATE_MINIMUM_HOURS) * 60;
  const step = stateRules ? settings.stateRoundingMinutes : client.roundingMinutes ?? settings.nonStateRoundingMinutes;
  return ceilToStep(Math.max(minutes, minimum), step);
}

interface HourlyRates {
  bill: number | null;
  pay: number | null;
  warnings: string[];
}

function hourlyRates(job: JobFacts, position: PositionFacts, settings: BillingSettings): HourlyRates {
  if (!isStateRules(job.category)) {
    const pay = position.rates.nonStateCents;
    return { bill: job.client.billing.rateCents ?? settings.defaultClientRateCents, pay, warnings: pay === null ? ["No Non-state rate on file for this interpreter."] : [] };
  }
  if (job.kingCounty.value && position.rates.kingCountyCents !== null) return { bill: position.rates.kingCountyCents, pay: position.rates.kingCountyCents, warnings: [] };
  const rate = position.rates.stateCents;
  const warnings: string[] = [];
  if (job.kingCounty.value) warnings.push(rate === null ? "No King County or State rate on file." : "No King County rate on file: the State rate was used.");
  else if (rate === null) warnings.push("No State rate on file for this interpreter.");
  return { bill: rate, pay: rate, warnings };
}

const hoursLine = (kind: LineItem["kind"], label: string, minutes: number, rate: number | null): LineItem => ({
  kind,
  label,
  quantity: minutesToHours(minutes),
  unit: "hr",
  rateCents: rate ?? 0,
  amountCents: minutesAmount(minutes, rate ?? 0),
});

const eachLine = (kind: LineItem["kind"], label: string, cents: number): LineItem => ({ kind, label, quantity: 1, unit: "each", rateCents: cents, amountCents: cents });

const mileageLine = (miles: number, rateCents: number): LineItem => ({
  kind: "mileage",
  label: "Mileage",
  quantity: miles,
  unit: "mi",
  rateCents,
  amountCents: unitsAmount(miles, rateCents),
});

const AWAITING: Record<PositionFacts["hoursState"], string> = {
  approved: "",
  awaiting_review: "Hours are awaiting review in Hours review.",
  missing: "No hours reported yet.",
};

export function positionLedger(job: JobFacts, position: PositionFacts, settings: BillingSettings): PositionLedger {
  const base = { positionId: position.positionId, interpreterId: position.interpreterId, interpreterName: position.interpreterName };
  if (job.outcome === "completed" && position.hoursState !== "approved") {
    return { ...base, included: false, billedUnits: 0, pay: [], bill: [], payTotalCents: 0, billTotalCents: 0, warnings: [AWAITING[position.hoursState]] };
  }

  const stateRules = isStateRules(job.category);
  const completed = job.outcome === "completed";
  const paid = job.outcome !== "cancelled_not_billable";
  const rates = hourlyRates(job, position, settings);
  const warnings = paid ? [...rates.warnings] : [];

  const worked = completed ? position.workedMinutes ?? 0 : job.outcome === "cancelled_billable" ? job.scheduledMinutes : 0;
  const service = paid ? billedServiceMinutes(worked, job, settings, job.client.billing) : 0;
  const addOn = stateRules && service > 0 ? FIRST_HOUR_ADD_ON_MINUTES : 0;
  const minimumApplied = service > 0 && Math.round(worked) < (stateRules ? STATE_MINIMUM_HOURS : NON_STATE_MINIMUM_HOURS) * 60;
  const serviceLabel = completed
    ? minimumApplied ? `Service (${stateRules ? STATE_MINIMUM_HOURS : NON_STATE_MINIMUM_HOURS} hr minimum)` : "Service"
    : "Late cancellation (scheduled time)";

  const travel = splitTravel(paid ? position.travelMinutes : 0, position.travelWindow, job.timeZone, {
    startMinute: settings.eveningStartMinute,
    endMinute: settings.eveningEndMinute,
    rateSet: position.rates.eveningCents !== null,
  });
  const miles = completed ? Math.max(0, position.approvedMiles) : 0;

  const pay: LineItem[] = [];
  const bill: LineItem[] = [];
  if (service > 0) {
    pay.push(hoursLine("service", serviceLabel, service, rates.pay));
    bill.push(hoursLine("service", serviceLabel, service, rates.bill));
  }
  if (addOn > 0) {
    pay.push(hoursLine("base_add_on", "First hour at 1.5× (+0.5 hr)", addOn, rates.pay));
    bill.push(hoursLine("base_add_on", "First hour at 1.5× (+0.5 hr)", addOn, rates.bill));
  }
  if (travel.dayMinutes > 0) {
    pay.push(hoursLine("travel", "Travel", travel.dayMinutes, rates.pay));
    bill.push(hoursLine("travel", "Travel", travel.dayMinutes, rates.bill));
  }
  if (travel.eveningMinutes > 0) {
    pay.push(hoursLine("travel_evening", "Travel (evening rate)", travel.eveningMinutes, position.rates.eveningCents));
    // State and HCA bill the interpreter's own rate, so the evening rate is billed too; a Non-state client pays its own rate.
    bill.push(hoursLine("travel_evening", "Travel (evening)", travel.eveningMinutes, stateRules ? position.rates.eveningCents : rates.bill));
  }
  if (miles > 0) {
    pay.push(mileageLine(miles, settings.mileageRateCents));
    bill.push(mileageLine(miles, settings.mileageRateCents));
  }
  if (stateRules) bill.push(eachLine("vendor_fee", "Vendor fee", settings.vendorFeeCents));
  if (stateRules && completed && job.inPerson) {
    bill.push(eachLine("onsite_fee", "Onsite fee", settings.onsiteFeeCents));
    if (position.commercialAuto) pay.push(eachLine("commercial_auto", "Commercial auto (in person)", settings.onsiteFeeCents));
  }

  return {
    ...base,
    included: true,
    billedUnits: minutesToHours(service + addOn),
    pay,
    bill,
    payTotalCents: sumCents(pay.map((l) => l.amountCents)),
    billTotalCents: sumCents(bill.map((l) => l.amountCents)),
    warnings,
  };
}

export function jobLedger(job: JobFacts, settings: BillingSettings): JobLedger {
  const positions = job.positions.map((p) => positionLedger(job, p, settings));
  const included = positions.filter((p) => p.included);
  return {
    job,
    positions,
    payTotalCents: sumCents(included.map((p) => p.payTotalCents)),
    billTotalCents: sumCents(included.map((p) => p.billTotalCents)),
  };
}
