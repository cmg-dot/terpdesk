import Papa from "papaparse";
import { CATEGORY_LABEL } from "@/lib/billing/categories";
import { OUTCOME_LABEL } from "@/lib/billing/ledger";
import type { InvoiceGroup, PayrollGroup } from "@/lib/billing/ledger";
import type { LineItem } from "@/lib/billing/types";

/**
 * The optional CSV exports (QuickBooks Desktop hand entry or Excel). One row per line item. Cells that a spreadsheet would read as a
 * formula (=, +, -, @) are escaped. Payroll carries no PHI; the invoice export carries the HCA fields only for HCA rows. Pure.
 */

const dollars = (cents: number): string => (cents / 100).toFixed(2);
const rate = (cents: number): string => (Number.isInteger(Math.round(cents * 1000) / 1000) ? dollars(cents) : (cents / 100).toFixed(3));
const lineCells = (line: LineItem): string[] => [line.label, String(line.quantity), line.unit, rate(line.rateCents), dollars(line.amountCents)];

const toCsv = (fields: string[], rows: string[][]): string => Papa.unparse({ fields, data: rows }, { escapeFormulae: true, newline: "\r\n" });

export function payrollCsv(groups: readonly PayrollGroup[]): string {
  const rows: string[][] = [];
  for (const g of groups) {
    for (const r of g.rows) {
      for (const line of r.lines) rows.push([g.interpreterName, r.serviceDate, r.reference, r.placeLabel, CATEGORY_LABEL[r.category], OUTCOME_LABEL[r.outcome], ...lineCells(line)]);
    }
    rows.push([g.interpreterName, "", "", "", "", "Total", "", "", "", "", dollars(g.totalCents)]);
  }
  return toCsv(["Interpreter", "Service date", "Reference", "Place", "Payer", "Outcome", "Item", "Quantity", "Unit", "Rate", "Amount"], rows);
}

export function invoiceCsv(groups: readonly InvoiceGroup[]): string {
  const rows: string[][] = [];
  for (const g of groups) {
    for (const ledger of g.jobs) {
      const { job } = ledger;
      const hca = job.hca;
      for (const position of ledger.positions) {
        if (!position.included) continue;
        const hcaCells = hca ? [hca.clientName, hca.dob, hca.providerOne, hca.priorAuth, hca.modifier, String(position.billedUnits)] : ["", "", "", "", "", ""];
        for (const line of position.bill) {
          rows.push([g.label, job.serviceDate, job.reference, position.interpreterName, OUTCOME_LABEL[job.outcome], ...hcaCells, ...lineCells(line)]);
        }
      }
    }
    rows.push([g.label, "", "", "", "Total", "", "", "", "", "", "", "", "", "", "", dollars(g.totalCents)]);
  }
  return toCsv(
    ["Payer", "Service date", "Reference", "Interpreter", "Outcome", "Client name", "DOB", "WA #", "PA #", "Modifier", "Billed units", "Item", "Quantity", "Unit", "Rate", "Amount"],
    rows,
  );
}
