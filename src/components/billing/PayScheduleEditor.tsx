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

type CutoffParts = Record<string, { date: string; time: string }>;

const PeriodList = ({ periods, cutoffParts }: { periods: PayPeriod[]; cutoffParts: CutoffParts }) => (
  <ul className="divide-y divide-gray-100">
    {periods.map((p) => (
      <PayPeriodRow key={p.id} period={p} cutoff={cutoffParts[p.id] ?? null} />
    ))}
  </ul>
);

/**
 * The semi-monthly pay schedule: "Add pay period" at the top opens the form right there; the periods are grouped by year (the
 * current year open, others folded with their count), and inside the open year the ones already over fold into "N earlier periods",
 * so the current and upcoming ones are what you see. Each row edits in place. A date no saved period covers falls in a standard
 * half-month (1st-15th, 16th-end) until one is added.
 */
export function PayScheduleEditor({ periods, cutoffParts, today }: { periods: PayPeriod[]; cutoffParts: CutoffParts; today: string }) {
  const [adding, setAdding] = useState(false);
  const { transition } = useHoursMotion();
  const currentYear = today.slice(0, 4);
  const years = Array.from(new Set(periods.map((p) => p.start.slice(0, 4)))).sort((a, b) => b.localeCompare(a));

  return (
    <RuleCard
      id="rules-pay-schedule"
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
            const earlier = year === currentYear ? inYear.filter((p) => p.end < today) : [];
            const current = year === currentYear ? inYear.filter((p) => p.end >= today) : inYear;
            return (
              <Expandable
                key={year}
                name={`pay-year-${year}`}
                defaultOpen={year === currentYear}
                className="rounded-xl border border-gray-200"
                headerClassName="px-4 py-2.5 max-sm:min-h-11"
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
                {earlier.length > 0 && current.length > 0 ? (
                  <>
                    <Expandable
                      name={`pay-earlier-${year}`}
                      className="border-b border-gray-100"
                      headerClassName="py-2.5 max-sm:min-h-11"
                      header={
                        <span className="text-sm font-medium text-[var(--accent-text)]">
                          {earlier.length} earlier period{earlier.length === 1 ? "" : "s"} in {year}
                        </span>
                      }
                    >
                      <PeriodList periods={earlier} cutoffParts={cutoffParts} />
                    </Expandable>
                    <PeriodList periods={current} cutoffParts={cutoffParts} />
                  </>
                ) : (
                  <PeriodList periods={inYear} cutoffParts={cutoffParts} />
                )}
              </Expandable>
            );
          })}
        </div>
      )}
    </RuleCard>
  );
}
