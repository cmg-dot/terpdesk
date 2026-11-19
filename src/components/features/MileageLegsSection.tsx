"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { FIELD_INPUT, FIELD_LABEL, LEG_INPUT } from "@/components/features/submitFormStyles";
import { sanitizeDecimal } from "@/lib/numericInput";

export interface MileageLeg {
  id: number;
  from: string;
  to: string;
  distance: number | string;
  type: "total" | "round_trip";
}

interface Props {
  legs: MileageLeg[];
  total: number;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof MileageLeg, value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  /** Every field is disabled (the appointment has not started). */
  locked: boolean;
  /** Single-column layout for narrow containers. */
  compact?: boolean;
}

const LEG_TYPE_OPTIONS = [
  { value: "total", label: "Total distance already travelled" },
  { value: "round_trip", label: "One-way distance + return on same route" },
];

/** "Mileage for this assignment" in the hours form: the travel legs with their counted distance, the total, and an optional note. */
export function MileageLegsSection({ legs, total, onAdd, onRemove, onUpdate, note, onNoteChange, locked, compact = false }: Props) {
  const legRow = compact ? "flex flex-col gap-3 mb-3" : "flex flex-col md:flex-row md:items-center gap-3 mb-3";
  const m = (cls: string) => (compact ? "" : cls);

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 mb-6">
      <h4 className="text-sm font-medium text-[var(--ink)] mb-2">Mileage for this assignment</h4>
      <p className="text-xs text-[var(--sage)] mb-6">
        Enter either the one-way distance and add a return on the same route, or enter the total distance already travelled without adding a return. This records miles only — no reimbursement is calculated here, and not every assignment pays mileage.
      </p>

      {legs.map((leg) => {
        const dist = parseFloat(String(leg.distance)) || 0;
        const legTotal = leg.type === "round_trip" ? dist * 2 : dist;
        return (
          <div key={leg.id} className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className={legRow}>
              <input type="text" disabled={locked} placeholder="From (Location)" aria-label="From (location)" value={leg.from} onChange={(e) => onUpdate(leg.id, "from", e.target.value)} className={`${LEG_INPUT} w-full ${m("md:flex-1")}`} />
              <input type="text" disabled={locked} placeholder="To (Location)" aria-label="To (location)" value={leg.to} onChange={(e) => onUpdate(leg.id, "to", e.target.value)} className={`${LEG_INPUT} w-full ${m("md:flex-1")}`} />
              {/* Text + decimal keypad, filtered as typed: digits and one "." only (type="number" lets letters / "e" through in some browsers). */}
              <input type="text" inputMode="decimal" autoComplete="off" disabled={locked} placeholder="Distance (mi)" aria-label="Distance (miles)" value={leg.distance} onChange={(e) => onUpdate(leg.id, "distance", sanitizeDecimal(e.target.value))} className={`${LEG_INPUT} w-full ${m("md:w-32 md:flex-none")}`} />
              <Dropdown
                id={`leg-type-${leg.id}`}
                ariaLabel="How the distance is counted"
                variant="compact"
                disabled={locked}
                value={leg.type}
                onChange={(type) => onUpdate(leg.id, "type", type)}
                options={LEG_TYPE_OPTIONS}
                className={`w-full ${m("md:flex-[1.5]")}`}
              />
              <button type="button" disabled={locked} onClick={() => onRemove(leg.id)} className={`text-sm font-medium text-gray-500 hover:text-red-600 self-end ${m("md:self-auto")} shrink-0 px-1 disabled:opacity-50 disabled:cursor-not-allowed`}>
                Remove
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Calculated total for this leg: <span className="font-semibold">{legTotal.toFixed(1)} mi</span> {legTotal === 0 ? "— no distance added" : ""}
            </p>
          </div>
        );
      })}

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <button type="button" disabled={locked} onClick={onAdd} className="bg-white border border-gray-300 text-gray-700 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          Add a travel leg
        </button>
        <span className="text-sm text-gray-700">Calculated total mileage: <span className="font-bold">{total.toFixed(1)} mi</span></span>
      </div>

      <div className="mb-4">
        <label className={FIELD_LABEL}>Mileage note (optional)</label>
        <textarea rows={2} disabled={locked} value={note} onChange={(e) => onNoteChange(e.target.value)} className={FIELD_INPUT}></textarea>
      </div>
      <p className="text-xs text-[var(--sage)]">Automatic driving distance is not switched on. No mapping service is connected to this workspace yet, so nothing can be calculated from an address today.</p>
    </div>
  );
}
