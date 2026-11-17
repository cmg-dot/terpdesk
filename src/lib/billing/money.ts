import type { Cents } from "@/lib/billing/types";

/** Money and time helpers for the billing engine. Pure. */

/** A stored numeric ("94.00", "0.760") or a number as cents (9400, 76); null when it is not a non-negative amount. */
export function toCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // Rounded to a thousandth of a cent so "0.760" is exactly 76, never 75.99999.
  return Math.round(n * 100 * 1000) / 1000;
}

/** Cents as the dollar text an input holds ("94.00", "0.76"); "" for none. */
export const centsToInput = (cents: number | null, decimals = 2): string => (cents === null ? "" : (cents / 100).toFixed(decimals));

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** "$1,234.50". */
export const formatCents = (cents: Cents): string => USD.format(cents / 100);

/** A per-unit rate that may carry a fraction of a cent: "$0.76", "$0.725", "$94.00". */
export const formatRate = (cents: number): string => {
  const dollars = cents / 100;
  return Number.isInteger(Math.round(cents * 1000) / 1000) ? USD.format(dollars) : `$${dollars.toFixed(3)}`;
};

/** The amount for `minutes` at an hourly rate, to the cent. */
export const minutesAmount = (minutes: number, hourlyCents: number): Cents => Math.round((minutes * hourlyCents) / 60);

/** The amount for a quantity at a per-unit rate, to the cent. */
export const unitsAmount = (quantity: number, rateCents: number): Cents => Math.round(quantity * rateCents);

/** Minutes as hours to two decimals (2.25). */
export const minutesToHours = (minutes: number): number => Math.round((minutes / 60) * 100) / 100;

/** "2", "2.25", "6.5": hours with no trailing zeros. */
export const formatUnits = (hours: number): string => String(Math.round(hours * 100) / 100);

/** `value` raised to the next multiple of `step` (whole minutes). A step below 1 leaves it as it is. */
export const ceilToStep = (value: number, step: number): number => (step >= 1 ? Math.ceil(value / step) * step : value);

export const sumCents = (amounts: readonly Cents[]): Cents => amounts.reduce((total, a) => total + a, 0);

/** Whether two typed dollar amounts are the same ("85" and "85.00" are; "" is only the same as ""). */
export function sameAmount(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x === "" || y === "") return x === y;
  const nx = Number(x);
  const ny = Number(y);
  return Number.isFinite(nx) && Number.isFinite(ny) ? Math.round(nx * 1000) === Math.round(ny * 1000) : x === y;
}
