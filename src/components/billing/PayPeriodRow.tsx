"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deletePayPeriod } from "@/app/actions/billingSettings";
import { PayPeriodForm } from "@/components/billing/PayPeriodForm";
import { quietButton } from "@/components/billing/rulesParts";
import { useBillingAction } from "@/hooks/useBillingAction";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { cutoffLabel, dayLabel, periodLabel } from "@/lib/billing/format";
import type { PayPeriod } from "@/lib/billing/payPeriods";
import { PANEL } from "@/lib/hoursMotion";
import type { PayPeriodInput } from "@/lib/validation/billing";

/**
 * One saved pay period: its service dates, when invoices are due and the pay date. "Edit" opens the form inside this row (it slides
 * open in place; nothing jumps to the end of the list), and Save or Cancel folds it back.
 */
export function PayPeriodRow({ period, cutoff }: { period: PayPeriod; cutoff: { date: string; time: string } | null }) {
  const [editing, setEditing] = useState(false);
  const remover = useBillingAction();
  const { transition } = useHoursMotion();
  const initial: PayPeriodInput = { id: period.id, start: period.start, end: period.end, cutoffDate: cutoff?.date ?? "", cutoffTime: cutoff?.time ?? "12:00", payDate: period.payDate ?? "" };

  return (
    <li className="py-2.5" data-pay-period={period.start}>
      {/* Phone: the period and its buttons on one line, the cutoff and pay date full width under it. Wider: four columns. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_9rem_auto]">
        <span className="order-1 font-medium text-[var(--ink)]">{periodLabel(period)}</span>
        <span className="order-3 col-span-2 text-[var(--sage)] sm:order-2 sm:col-span-1">{period.cutoffAt ? `Invoices due ${cutoffLabel(period.cutoffAt)}` : "No cutoff"}</span>
        <span className="order-4 col-span-2 tabular-nums text-[var(--sage)] sm:order-3 sm:col-span-1">{period.payDate ? `Paid ${dayLabel(period.payDate)}` : "No pay date"}</span>
        {/* Hidden (not removed) while editing, so the row's columns keep their place. */}
        <span className={`order-2 flex gap-2 justify-self-end sm:order-4 ${editing ? "invisible" : ""}`} aria-hidden={editing}>
          <button type="button" className={quietButton} onClick={() => setEditing(true)} aria-label={`Edit ${periodLabel(period)}`}>
            Edit
          </button>
          <button type="button" className={quietButton} disabled={remover.pending} onClick={() => void remover.run(() => deletePayPeriod({ id: period.id }))} aria-label={`Remove ${periodLabel(period)}`}>
            {remover.pending ? "Removing…" : "Remove"}
          </button>
        </span>
      </div>
      {remover.error && <p role="alert" className="mt-1 text-xs text-red-700">{remover.error}</p>}
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div key="edit" initial={PANEL.initial} animate={PANEL.animate} exit={PANEL.exit} transition={transition()}>
            <div className="pt-3">
              <PayPeriodForm initial={initial} idPrefix={`pp-${period.id}`} submitLabel="Save pay period" onDone={() => setEditing(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
