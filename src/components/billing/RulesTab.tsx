import { formatInTimeZone } from "date-fns-tz";
import { ClientTermsTable } from "@/components/billing/ClientTermsTable";
import { HolidaysEditor } from "@/components/billing/HolidaysEditor";
import { InterpreterRatesTable } from "@/components/billing/InterpreterRatesTable";
import { PayScheduleEditor } from "@/components/billing/PayScheduleEditor";
import { RuleCard } from "@/components/billing/rulesParts";
import { SettingsForm } from "@/components/billing/SettingsForm";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import type { Holiday } from "@/lib/billing/holidays";
import { centsToInput } from "@/lib/billing/money";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import type { ClientTermsRow, InterpreterRateRow } from "@/lib/billing/rulesData";
import { minuteToTime } from "@/lib/billing/settings";
import type { BillingSettings } from "@/lib/billing/types";
import type { BillingSettingsInput } from "@/lib/validation/billing";

const formSettings = (s: BillingSettings): BillingSettingsInput => ({
  mileageRate: centsToInput(s.mileageRateCents, 3).replace(/0$/, ""),
  vendorFee: centsToInput(s.vendorFeeCents),
  onsiteFee: centsToInput(s.onsiteFeeCents),
  defaultClientRate: centsToInput(s.defaultClientRateCents),
  nonStateRoundingMinutes: s.nonStateRoundingMinutes === 15 ? "15" : "30",
  stateRoundingMinutes: s.stateRoundingMinutes === 30 ? "30" : s.stateRoundingMinutes === 1 ? "1" : "15",
  businessDayStart: minuteToTime(s.businessDayStartMinute),
  businessDayEnd: minuteToTime(s.businessDayEndMinute),
  cancelNoticeBusinessDays: String(s.cancelNoticeBusinessDays),
  eveningStart: minuteToTime(s.eveningStartMinute),
  eveningEnd: minuteToTime(s.eveningEndMinute),
});

interface RulesTabProps {
  settings: BillingSettings;
  periods: PayPeriod[];
  holidays: Holiday[];
  clients: ClientTermsRow[];
  interpreters: InterpreterRateRow[];
  now: Date;
}

/** Billing > Rates & rules: settings, the pay schedule, holidays, organizations' rates and interpreters' rates. */
export function RulesTab({ settings, periods, holidays, clients, interpreters, now }: RulesTabProps) {
  // The cutoff is edited as a date and time on the agency's clock.
  const cutoffParts: Record<string, { date: string; time: string }> = {};
  for (const p of periods) if (p.cutoffAt) cutoffParts[p.id] = { date: formatInTimeZone(p.cutoffAt, BUSINESS_ZONE, "yyyy-MM-dd"), time: formatInTimeZone(p.cutoffAt, BUSINESS_ZONE, "HH:mm") };
  const lastYear = holidays.reduce((y, h) => Math.max(y, Number(h.date.slice(0, 4))), Number(formatInTimeZone(now, BUSINESS_ZONE, "yyyy")));
  return (
    <div className="space-y-6">
      <SettingsForm initial={formSettings(settings)} />
      <PayScheduleEditor periods={periods} cutoffParts={cutoffParts} currentYear={formatInTimeZone(now, BUSINESS_ZONE, "yyyy")} />
      <HolidaysEditor holidays={holidays} nextYear={lastYear + 1} />
      <RuleCard title="Organization rates (Non-state)" note="Each organization's hourly rate and rounding step. Empty uses the defaults above (Tacoma Schools $85 in 15-minute steps, Yakima Schools $99).">
        <ClientTermsTable rows={clients} defaultRate={centsToInput(settings.defaultClientRateCents)} defaultRounding={String(settings.nonStateRoundingMinutes)} />
      </RuleCard>
      <RuleCard title="Interpreter rates" note="State and King County rates are billed and paid on State and HCA jobs; the Non-state rate is paid on Non-state jobs. Evening travel applies inside the evening window.">
        <InterpreterRatesTable rows={interpreters} />
      </RuleCard>
    </div>
  );
}
