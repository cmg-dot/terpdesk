import { CalendarDays, CalendarRange, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

const ICONS: Record<MileageRange, LucideIcon> = { "30": CalendarDays, "90": CalendarRange, all: History };

/**
 * Worked hours and counted miles for the last 30 days, the last 90 days and all time, drawn like the Website requests stat tiles: a soft
 * tint, an icon badge, the hours as the headline and the miles and job count beneath. Each tile is also the date range for the list below
 * it (the pressed one has a ring). The totals are for the whole range; the search and filters narrow the list, not these numbers.
 */
export function MyWorkTotals({ jobs, range, onRange, nowMs }: MyWorkTotalsProps) {
  return (
    <div role="group" aria-label="Totals and date range" data-my-work-totals="" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {MILEAGE_RANGES.map((option) => {
        const totals = personalJobTotals(personalJobsInRange(jobs, option.value, nowMs));
        const selected = range === option.value;
        const Icon = ICONS[option.value];
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            data-range={option.value}
            onClick={() => onRange(option.value)}
            className={`group relative flex min-w-0 items-center gap-3 rounded-2xl bg-[var(--tint)] p-4 text-left text-[var(--tint-ink)] transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_10px_28px_-14px_rgb(var(--forest-rgb)_/_0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
              selected ? "ring-2 ring-[var(--forest)]" : ""
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70">
              <Icon className="h-5 w-5 text-[var(--forest)]" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[26px] font-semibold leading-none text-[var(--forest)]">{hoursLabel(totals.workedMinutes)}</span>
              <span className="mt-1 block text-[12px] font-medium">{option.label}</span>
              <span className="mt-0.5 block text-[12px] opacity-80">
                {totals.miles.toFixed(1)} mi counted · {totals.jobs === 1 ? "1 job" : `${totals.jobs} jobs`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
