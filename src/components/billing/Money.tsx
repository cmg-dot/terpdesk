import { formatCents } from "@/lib/billing/money";

/**
 * How money reads on /billing: always tabular numerals, right-aligned in tables. Totals are a fixed semantic emerald in every
 * workspace theme (money, not brand); Dark Mode keeps the pills soft on dark cards (themes.css, .money-pill / .money-total).
 */

/** A plain amount (a line item): dark, tabular. */
export const Amount = ({ cents, className = "" }: { cents: number; className?: string }) => (
  <span className={`whitespace-nowrap font-medium tabular-nums text-[var(--ink)] ${className}`}>{formatCents(cents)}</span>
);

/** A total: emerald semibold, tabular. `size` "lg" for card headers, "xl" for the summary tiles. */
export const Total = ({ cents, size = "md", className = "" }: { cents: number; size?: "md" | "lg" | "xl"; className?: string }) => {
  const scale = size === "xl" ? "text-2xl" : size === "lg" ? "text-lg" : "text-sm";
  return <span className={`money-total whitespace-nowrap font-semibold tabular-nums text-emerald-700 ${scale} ${className}`}>{formatCents(cents)}</span>;
};

/** A total in a soft emerald pill (card headers, the +$10). */
export const MoneyPill = ({ cents, prefix = "", className = "" }: { cents: number; prefix?: string; className?: string }) => (
  <span className={`money-pill inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 font-semibold tabular-nums text-emerald-700 ${className}`}>
    {prefix}
    {formatCents(cents)}
  </span>
);
