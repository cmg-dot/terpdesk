import Link from "next/link";
import { dayLabel } from "@/lib/billing/format";
import type { AttentionItem } from "@/lib/billing/ledger";

/** What is left out of the totals, and why (hours not approved yet, a missing rate). Collapsed so it never crowds the ledger. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-amber-900">
        {items.length} item{items.length === 1 ? "" : "s"} need{items.length === 1 ? "s" : ""} attention before this period is complete
      </summary>
      <ul className="mt-3 space-y-1.5">
        {items.map((item, i) => (
          <li key={`${item.requestId}-${i}`} className="flex flex-wrap gap-x-2 text-amber-900">
            <span className="tabular-nums">{dayLabel(item.serviceDate)}</span>
            <Link href={`/requests/${item.requestId}`} className="font-medium underline-offset-2 hover:underline">
              {item.reference}
            </Link>
            <span>· {item.who}:</span>
            <span>{item.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
