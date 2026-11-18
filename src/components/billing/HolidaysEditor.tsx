"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { addHoliday, addStateHolidays, removeHoliday } from "@/app/actions/billingSettings";
import { RuleCard, RuleField, SaveStatus, primaryButton, quietButton, ruleInput } from "@/components/billing/rulesParts";
import { IconInput } from "@/components/ui/IconInput";
import { useBillingAction } from "@/hooks/useBillingAction";
import { dayLabel } from "@/lib/billing/format";
import type { Holiday } from "@/lib/billing/holidays";

/** Days that are not business days for the cancellation notice. Grouped by year; a year's WA state list can be added in one step. */
export function HolidaysEditor({ holidays, nextYear }: { holidays: Holiday[]; nextYear: number }) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const adder = useBillingAction();
  const remover = useBillingAction();
  const years = Array.from(new Set(holidays.map((h) => h.date.slice(0, 4)))).sort();
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (await adder.run(() => addHoliday({ date, label }))) {
      setDate("");
      setLabel("");
    }
  };

  return (
    <RuleCard id="rules-holidays" title="Holidays" note="Not counted as business days when a cancellation's notice is measured. Seeded with WA state holidays as observed.">
      <div className="mb-5 space-y-4">
        {years.map((year) => (
          <div key={year}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sage)]">{year}</div>
            <ul className="flex flex-wrap gap-2">
              {holidays
                .filter((h) => h.date.startsWith(year))
                .map((h) => (
                  <li key={h.date} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1 text-xs">
                    <span className="tabular-nums text-[var(--sage)]">{dayLabel(h.date, "MMM d")}</span>
                    <span className="text-[var(--ink)]">{h.label}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${h.label} ${h.date}`}
                      disabled={remover.pending}
                      onClick={() => void remover.run(() => removeHoliday({ date: h.date }))}
                      // On a phone the button's box is 44px (the negative margins keep the chip its size).
                      className="rounded-full px-2 py-0.5 text-gray-600 hover:bg-gray-100 hover:text-gray-800 max-sm:-my-2 max-sm:flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:justify-center"
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <RuleField id="hol-date" label="Date" error={adder.fieldErrors.date}>
            <IconInput kind="date" id="hol-date" value={date} onChange={(e) => setDate(e.target.value)} className={ruleInput} />
          </RuleField>
        </div>
        <div className="w-64">
          <RuleField id="hol-label" label="Name" error={adder.fieldErrors.label}>
            <input id="hol-label" type="text" maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} className={ruleInput} />
          </RuleField>
        </div>
        <button type="submit" disabled={adder.pending} className={primaryButton}>
          Add holiday
        </button>
        <button type="button" disabled={adder.pending} className={quietButton} onClick={() => void adder.run(() => addStateHolidays({ year: nextYear }))}>
          Add WA state holidays for {nextYear}
        </button>
      </form>
      <div className="mt-3">
        <SaveStatus error={adder.error ?? remover.error} saved={adder.saved} />
      </div>
    </RuleCard>
  );
}
