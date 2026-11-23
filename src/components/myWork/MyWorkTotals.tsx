import { MILEAGE_RANGES } from "@/lib/mileageSummary";
import type { MileageRange } from "@/lib/mileageSummary";
import { hoursLabel, personalJobTotals, personalJobsInRange } from "@/lib/personalJobs";
import type { PersonalJobView } from "@/lib/personalJobs";

interface MyWorkTotalsProps {
  jobs: readonly PersonalJobView[];
  range: MileageRange;
  onRange: (range: MileageRange) => void;
  /** When the jobs were read (ms); the 30 and 90 day windows end here, so a render is stable. */
  nowMs: number;
}

/**
 * Worked hours and counted miles for the last 30 days, the last 90 days and all time. Each tile is also the filter for the list
 * below it, the way the Website requests stats are. Hours are the window less the unpaid break; round trips count double.
 */
export function MyWorkTotals({ jobs, range, onRange, nowMs }: MyWorkTotalsProps) {
  return (
    <div role="group" aria-label="Totals and date range" data-my-work-totals="" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MILEAGE_RANGES.map((option) => {
        const totals = personalJobTotals(personalJobsInRange(jobs, option.value, nowMs));
        const selected = range === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            data-range={option.value}
            onClick={() => onRange(option.value)}
            className={`rounded-2xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] ${
              selected ? "border-[var(--forest)] bg-[var(--tint)]" : "border-gray-200 bg-white hover:bg-[var(--surface)]"
            }`}
          >
            <span className={`text-[12px] font-semibold uppercase tracking-wider ${selected ? "text-[var(--tint-ink)]" : "text-[var(--sage)]"}`}>{option.label}</span>
            <span className="mt-1 block text-[26px] font-semibold tracking-tight text-[var(--ink)]">{hoursLabel(totals.workedMinutes)}</span>
            <span className="mt-0.5 block text-[13px] text-[var(--sage)]">
              {totals.miles.toFixed(1)} mi counted · {totals.jobs === 1 ? "1 job" : `${totals.jobs} jobs`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
