"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { saveBillingSettings } from "@/app/actions/billingSettings";
import { RuleCard, RuleField, SaveStatus, primaryButton, ruleInput } from "@/components/billing/rulesParts";
import { useBillingAction } from "@/hooks/useBillingAction";
import type { BillingSettingsField, BillingSettingsInput } from "@/lib/validation/billing";

const FIELDS: { field: BillingSettingsField; label: string; hint: string }[] = [
  { field: "mileageRate", label: "Mileage rate ($/mile)", hint: "Paid and billed on completed jobs; never on cancellations." },
  { field: "vendorFee", label: "Vendor fee ($)", hint: "Per booked interpreter on State and HCA jobs, cancelled ones included." },
  { field: "onsiteFee", label: "Onsite / commercial auto fee ($)", hint: "Billed per interpreter on completed in-person State and HCA jobs; paid on with commercial auto." },
  { field: "defaultClientRate", label: "Default organization rate ($/hour)", hint: "Non-state jobs, unless the organization has its own rate below." },
];

const SELECT = `${ruleInput} pr-8`;

/** The agency's billing settings. Every total on the other tabs follows these. */
export function SettingsForm({ initial }: { initial: BillingSettingsInput }) {
  const [values, setValues] = useState<BillingSettingsInput>(initial);
  const { run, pending, error, fieldErrors, saved } = useBillingAction();
  const set = (field: BillingSettingsField) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => saveBillingSettings(values));
  };
  const input = (field: BillingSettingsField, type = "text") => (
    <input
      id={`bs-${field}`}
      type={type}
      inputMode={type === "text" ? "decimal" : undefined}
      value={values[field]}
      onChange={(e) => set(field)(e.target.value)}
      aria-invalid={Boolean(fieldErrors[field])}
      className={ruleInput}
    />
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
            <select id="bs-nonStateRoundingMinutes" value={values.nonStateRoundingMinutes} onChange={(e) => set("nonStateRoundingMinutes")(e.target.value)} className={SELECT}>
              <option value="30">30 minutes</option>
              <option value="15">15 minutes</option>
            </select>
          </RuleField>
          <RuleField id="bs-stateRoundingMinutes" label="State / HCA rounding" hint="Service time is rounded up to this step." error={fieldErrors.stateRoundingMinutes}>
            <select id="bs-stateRoundingMinutes" value={values.stateRoundingMinutes} onChange={(e) => set("stateRoundingMinutes")(e.target.value)} className={SELECT}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="1">No rounding</option>
            </select>
          </RuleField>
          <RuleField id="bs-cancelNoticeBusinessDays" label="Cancellation notice (business days)" hint="Less notice than this makes a cancellation billable." error={fieldErrors.cancelNoticeBusinessDays}>
            {input("cancelNoticeBusinessDays")}
          </RuleField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Two columns wide, like the evening window, so a time box always has room for "5:00 PM". */}
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <RuleField id="bs-businessDayStart" label="Business day from (Pacific)" error={fieldErrors.businessDayStart}>
              {input("businessDayStart", "time")}
            </RuleField>
            <RuleField id="bs-businessDayEnd" label="to" error={fieldErrors.businessDayEnd}>
              {input("businessDayEnd", "time")}
            </RuleField>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <RuleField id="bs-eveningStart" label="Evening travel from" hint="Leave both empty for no evening split." error={fieldErrors.eveningStart}>
              {input("eveningStart", "time")}
            </RuleField>
            <RuleField id="bs-eveningEnd" label="to" hint="May end the next morning." error={fieldErrors.eveningEnd}>
              {input("eveningEnd", "time")}
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
