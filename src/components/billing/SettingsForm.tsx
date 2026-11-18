"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveBillingSettings } from "@/app/actions/billingSettings";
import { RuleCard, RuleField, SaveStatus, primaryButton, ruleInput } from "@/components/billing/rulesParts";
import { Dropdown } from "@/components/ui/Dropdown";
import { IconInput } from "@/components/ui/IconInput";
import { useBillingAction } from "@/hooks/useBillingAction";
import type { DropdownOption } from "@/lib/dropdown";
import type { BillingSettingsField, BillingSettingsInput } from "@/lib/validation/billing";

const FIELDS: { field: BillingSettingsField; label: string; hint: string }[] = [
  { field: "mileageRate", label: "Mileage rate ($/mile)", hint: "Paid and billed on completed jobs; never on cancellations." },
  { field: "vendorFee", label: "Vendor fee ($)", hint: "Per booked interpreter on State and HCA jobs, cancelled ones included." },
  { field: "onsiteFee", label: "Onsite / commercial auto fee ($)", hint: "Billed per interpreter on completed in-person State and HCA jobs; paid on with commercial auto." },
  { field: "defaultClientRate", label: "Default organization rate ($/hour)", hint: "Non-state jobs, unless the organization has its own rate below." },
];

const NON_STATE_ROUNDING: DropdownOption[] = [
  { value: "30", label: "30 minutes" },
  { value: "15", label: "15 minutes" },
];
const STATE_ROUNDING: DropdownOption[] = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "1", label: "No rounding" },
];
type TimeField = "businessDayStart" | "businessDayEnd" | "eveningStart" | "eveningEnd";

/** The agency's billing settings. Every total on the other tabs follows these. */
export function SettingsForm({ initial }: { initial: BillingSettingsInput }) {
  const [values, setValues] = useState<BillingSettingsInput>(initial);
  const { run, pending, error, fieldErrors, saved } = useBillingAction();
  const set = (field: BillingSettingsField) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => saveBillingSettings(values));
  };
  const input = (field: BillingSettingsField) => (
    <input id={`bs-${field}`} type="text" inputMode="decimal" value={values[field]} onChange={(e) => set(field)(e.target.value)} aria-invalid={Boolean(fieldErrors[field])} className={ruleInput} />
  );
  // The app's time selector (hour / minute / AM-PM); the evening pair is optional, so it can be cleared.
  const time = (field: TimeField, clearable = false) => (
    <IconInput kind="time" id={`bs-${field}`} value={values[field]} onChange={(e) => set(field)(e.target.value)} clearable={clearable} placeholder="Not set" aria-invalid={Boolean(fieldErrors[field])} className={ruleInput} />
  );

  return (
    <RuleCard title="Fees, rounding and business hours" note="State and HCA: 1.5 hr minimum and the 1.5x first hour (+0.5 hr) are fixed rules. Non-state: 2 hr minimum.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((f) => (
            <RuleField key={f.field} id={`bs-${f.field}`} label={f.label} hint={f.hint} error={fieldErrors[f.field]}>
              {input(f.field)}
            </RuleField>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RuleField id="bs-nonStateRoundingMinutes" label="Non-state rounding (after 2 hr)" hint="Default step; an organization can use 15 minutes." error={fieldErrors.nonStateRoundingMinutes}>
            <Dropdown id="bs-nonStateRoundingMinutes" variant="field" className="w-full" options={NON_STATE_ROUNDING} value={values.nonStateRoundingMinutes} onChange={set("nonStateRoundingMinutes")} />
          </RuleField>
          <RuleField id="bs-stateRoundingMinutes" label="State / HCA rounding" hint="Service time is rounded up to this step." error={fieldErrors.stateRoundingMinutes}>
            <Dropdown id="bs-stateRoundingMinutes" variant="field" className="w-full" options={STATE_ROUNDING} value={values.stateRoundingMinutes} onChange={set("stateRoundingMinutes")} />
          </RuleField>
          <RuleField id="bs-cancelNoticeBusinessDays" label="Cancellation notice (business days)" hint="Less notice than this makes a cancellation billable." error={fieldErrors.cancelNoticeBusinessDays}>
            {input("cancelNoticeBusinessDays")}
          </RuleField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Two columns wide, like the evening window, so a time box always has room for "5:00 PM". */}
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <RuleField id="bs-businessDayStart" label="Business day from (Pacific)" error={fieldErrors.businessDayStart}>
              {time("businessDayStart")}
            </RuleField>
            <RuleField id="bs-businessDayEnd" label="to" error={fieldErrors.businessDayEnd}>
              {time("businessDayEnd")}
            </RuleField>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <RuleField id="bs-eveningStart" label="Evening travel from" hint="Leave both empty for no evening split." error={fieldErrors.eveningStart}>
              {time("eveningStart", true)}
            </RuleField>
            <RuleField id="bs-eveningEnd" label="to" hint="May end the next morning." error={fieldErrors.eveningEnd}>
              {time("eveningEnd", true)}
            </RuleField>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          <SaveStatus error={error} saved={saved} />
        </div>
      </form>
    </RuleCard>
  );
}
