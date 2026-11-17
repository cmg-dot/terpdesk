import { formatCents, formatRate, formatUnits } from "@/lib/billing/money";
import type { LineItem } from "@/lib/billing/types";

const UNIT: Record<LineItem["unit"], string> = { hr: "hr", mi: "mi", each: "" };

/** One side (pay or bill) of a position: item, quantity x rate, amount. */
export function LineTable({ lines, total }: { lines: LineItem[]; total?: number }) {
  if (lines.length === 0) return <p className="text-sm text-[var(--sage)]">Nothing to pay or bill.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.kind}-${i}`} className="border-b border-gray-100 last:border-b-0">
            <td className="py-1.5 pr-3 text-[var(--ink)]">{l.label}</td>
            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-[var(--sage)]">
              {l.unit === "each" ? "" : `${formatUnits(l.quantity)} ${UNIT[l.unit]} × ${formatRate(l.rateCents)}`}
            </td>
            <td className="whitespace-nowrap py-1.5 text-right font-medium tabular-nums text-[var(--ink)]">{formatCents(l.amountCents)}</td>
          </tr>
        ))}
        {total !== undefined && (
          <tr>
            <td className="pt-2 font-semibold text-[var(--ink)]" colSpan={2}>
              Total
            </td>
            <td className="pt-2 text-right font-semibold tabular-nums text-[var(--ink)]">{formatCents(total)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
