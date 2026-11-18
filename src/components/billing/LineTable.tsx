import { FeeBadge } from "@/components/billing/CategoryBadge";
import { Amount, Total } from "@/components/billing/Money";
import { formatRate, formatUnits } from "@/lib/billing/money";
import type { LineItem } from "@/lib/billing/types";

const UNIT: Record<LineItem["unit"], string> = { hr: "hr", mi: "mi", each: "" };
/** These lines read as their pill rather than as text. */
const FEE_KINDS: ReadonlySet<LineItem["kind"]> = new Set<LineItem["kind"]>(["vendor_fee", "onsite_fee", "commercial_auto"]);

/**
 * One side (pay or bill) of a position: the item (a fee as its pill), quantity × rate, and the amount, right-aligned in tabular
 * numerals so a column of amounts lines up; the subtotal in emerald under a rule (when there is more than one line to add up).
 */
export function LineTable({ lines, total, totalLabel = "Total" }: { lines: LineItem[]; total?: number; totalLabel?: string }) {
  if (lines.length === 0) return <p className="text-sm text-[var(--sage)]">Nothing to pay or bill.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.kind}-${i}`} className="border-b border-gray-100 last:border-b-0">
            <td className="py-1.5 pr-3 text-[var(--ink)]">{FEE_KINDS.has(l.kind) ? <FeeBadge kind={l.kind} /> : l.label}</td>
            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-[var(--sage)]">
              {l.unit === "each" ? "" : `${formatUnits(l.quantity)} ${UNIT[l.unit]} × ${formatRate(l.rateCents)}`}
            </td>
            <td className="py-1.5 text-right">
              <Amount cents={l.amountCents} />
            </td>
          </tr>
        ))}
        {/* A single line already is the total: repeating it under a rule only adds a third copy of the number. */}
        {total !== undefined && lines.length > 1 && (
          <tr className="border-t border-gray-200">
            <td className="pt-2 font-semibold text-[var(--ink)]" colSpan={2}>
              {totalLabel}
            </td>
            <td className="pt-2 text-right">
              <Total cents={total} />
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
