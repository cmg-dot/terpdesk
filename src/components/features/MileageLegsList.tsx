import { roundMiles } from "@/lib/timesheetSchemas";
import { countedMilesOf } from "@/lib/mileageSummary";
import type { MileageLegView } from "@/lib/mileageSummary";

/** The itemised legs of a submission, with what each one counts for and the total. Read-only. */
export function MileageLegsList({ legs }: { legs: MileageLegView[] }) {
  const total = roundMiles(legs.reduce((sum, leg) => sum + countedMilesOf(leg), 0));
  return (
    <div>
      <ul className="space-y-1.5">
        {legs.map((leg, i) => (
          <li key={i} className="text-xs text-[var(--ink)] bg-gray-50 p-2.5 rounded-lg border border-gray-100">
            {leg.fromLabel || "—"} → {leg.toLabel || "—"} · {(leg.miles ?? 0).toFixed(1)} mi
            {leg.roundTrip ? ` × 2 (round trip) = ${countedMilesOf(leg).toFixed(1)} mi` : ""}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--sage)]">Total counted: {total.toFixed(1)} mi</p>
    </div>
  );
}
