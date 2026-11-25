"use client";

import { motion } from "framer-motion";
import { useHoursMotion } from "@/hooks/useHoursMotion";
import { amountText, formatAmount, meterMet, meterPercent } from "@/lib/ceu";
import type { Meter } from "@/lib/ceu";
import type { CeuUnit } from "@/lib/validation/ceu";

interface ProgressMeterProps {
  label: string;
  meter: Meter;
  unit: CeuUnit;
  /** The thinner, softer bar used for the ethics and PPO sub-targets. */
  secondary?: boolean;
}

/** One target: "Ethics  1 of 1 CEU  Met" over a bar. Only drawn for a target that is tracked. The bar grows once, and not at all with reduced motion. */
export function ProgressMeter({ label, meter, unit, secondary = false }: ProgressMeterProps) {
  const { reduce, transition } = useHoursMotion();
  const percent = meterPercent(meter);
  if (percent === null || meter.target === null) return null;
  const met = meterMet(meter);
  const summary = `${formatAmount(meter.earned)} of ${amountText(meter.target, unit)}`;
  return (
    <div data-ceu-meter={label} className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-medium text-[var(--ink)]">{label}</span>
        <span className="flex items-center gap-2 text-[var(--sage)]">
          {summary}
          {met && <span className="rounded-full bg-[var(--pill)] px-2 py-0.5 text-[11px] font-semibold text-white">Met</span>}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${summary}`}
        aria-valuemin={0}
        aria-valuemax={meter.target}
        aria-valuenow={Math.min(meter.earned, meter.target)}
        className={`overflow-hidden rounded-full bg-[var(--tint)] ${secondary ? "h-1.5" : "h-2.5"}`}
      >
        <motion.div
          data-ceu-fill=""
          className={`h-full rounded-full ${secondary ? "bg-[var(--forest-soft)]" : "bg-[var(--forest)]"}`}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${percent}%`, transition: transition(0.4) }}
        />
      </div>
    </div>
  );
}
