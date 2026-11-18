"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { EMPTY_PAY_PERIOD, PayPeriodForm } from "@/components/billing/PayPeriodForm";
import { PayPeriodRow } from "@/components/billing/PayPeriodRow";
import { RuleCard, primaryButton } from "@/components/billing/rulesParts";
import { Expandable } from "@/components/ui/Expandable";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import { PANEL } from "@/lib/hoursMotion";

/**
 * The semi-monthly pay schedule: "Add pay period" at the top opens the form right there; the periods are grouped by year (the
 * current year open, others folded with their count), and each row edits in place. A date no saved period covers falls in a
 * standard half-month (1st-15th, 16th-end) until one is added.
 */
export function PayScheduleEditor({ periods, cutoffParts, currentYear }: { periods: PayPeriod[]; cutoffParts: Record<string, { date: string; time: string }>; currentYear: string }) {
  const [adding, setAdding] = useState(false);
  const { transition } = useHoursMotion();
  const years = Array.from(new Set(periods.map((p) => p.start.slice(0, 4)))).sort((a, b) => b.localeCompare(a));

  return (
    <RuleCard
      title="Pay schedule (semi-monthly)"
      note="Service dates paid in each run, when invoices are due (noon Pacific) and the pay date."
      action={
        !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryButton} inline-flex items-center gap-1.5`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add pay period
          </button>
        )
      }
    >
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="add" initial={PANEL.initial} animate={PANEL.animate} exit={PANEL.exit} transition={transition()}>
            <div className="pb-4">
              <PayPeriodForm initial={EMPTY_PAY_PERIOD} idPrefix="pp-new" submitLabel="Add pay period" onDone={() => setAdding(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {periods.length === 0 ? (
        <p className="billing-attention rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">No pay periods are saved yet: the standard halves of the month are used, with no cutoff or pay date.</p>
      ) : (
        <div className="space-y-2">
          {years.map((year) => {
            const inYear = periods.filter((p) => p.start.startsWith(year)).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <Expandable
                key={year}
                name={`pay-year-${year}`}
                defaultOpen={year === currentYear}
                className="rounded-xl border border-gray-200"
                headerClassName="px-4 py-2.5"
                bodyClassName="border-t border-gray-100 px-4"
                header={
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold text-[var(--ink)]">{year}</span>
                    <span className="text-xs text-[var(--sage)]">
                      {inYear.length} period{inYear.length === 1 ? "" : "s"}
                    </span>
                  </span>
                }
              >
                <ul className="divide-y divide-gray-100">
                  {inYear.map((p) => (
                    <PayPeriodRow key={p.id} period={p} cutoff={cutoffParts[p.id] ?? null} />
                  ))}
                </ul>
              </Expandable>
            );
          })}
        </div>
      )}
    </RuleCard>
  );
}
