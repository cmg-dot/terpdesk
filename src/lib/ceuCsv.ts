import Papa from "papaparse";
import type { CycleView, EntryView } from "@/lib/ceu";
import { formatAmount } from "@/lib/ceu";
import { UNIT_LABEL } from "@/lib/validation/ceu";

/**
 * The private CEU transcript as a CSV. Pure. Every cell goes through Papa's `escapeFormulae`, so a title or provider that starts with
 * = + - @ (or a tab or carriage return) is written with a leading quote and a spreadsheet shows it as text instead of running it.
 * A leading byte-order mark makes Excel read the accents right.
 */

export const CEU_CSV_HEADER = ["Date earned", "Title", "Provider", "Category", "Amount", "Unit", "Ethics", "PPO", "Cycle"] as const;

export function ceuCsvRows(entries: readonly EntryView[], cycles: readonly CycleView[]): string[][] {
  const labels = new Map(cycles.map((c) => [c.id, c.label]));
  return entries.map((e) => [
    e.earnedOn, e.title, e.provider, e.category, formatAmount(e.amount), UNIT_LABEL[e.unit], e.isEthics ? "Yes" : "", e.isPpo ? "Yes" : "",
    e.cycleId ? labels.get(e.cycleId) ?? "" : "",
  ]);
}

export function ceuCsvText(entries: readonly EntryView[], cycles: readonly CycleView[]): string {
  const csv = Papa.unparse({ fields: [...CEU_CSV_HEADER], data: ceuCsvRows(entries, cycles) }, { escapeFormulae: true, newline: "\r\n" });
  return `﻿${csv}`;
}
