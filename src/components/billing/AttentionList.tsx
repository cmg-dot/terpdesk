"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Expandable } from "@/components/ui/Expandable";
import { dayLabel } from "@/lib/billing/format";
import type { AttentionItem } from "@/lib/billing/ledger";

/** What is left out of the totals, and why (hours not approved yet, a missing rate). Folded so it never crowds the ledger. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Expandable
      name="attention"
      className="billing-attention rounded-2xl border border-amber-200 bg-amber-50 text-sm"
      headerClassName="px-5 py-3"
      bodyClassName="px-5 pb-4"
      header={
        <span className="flex items-center gap-2 font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          {items.length} item{items.length === 1 ? "" : "s"} need{items.length === 1 ? "s" : ""} attention before this period is complete
        </span>
      }
    >
      <ul className="space-y-1.5 border-t border-amber-200 pt-3">
        {items.map((item, i) => (
          <li key={`${item.requestId}-${i}`} className="flex flex-wrap gap-x-2 text-amber-900 max-sm:items-center">
            <span className="tabular-nums">{dayLabel(item.serviceDate)}</span>
            <Link href={`/requests/${item.requestId}`} className="font-medium underline-offset-2 hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">
              {item.reference}
            </Link>
            <span>· {item.who}:</span>
            <span>{item.message}</span>
          </li>
        ))}
      </ul>
    </Expandable>
  );
}
