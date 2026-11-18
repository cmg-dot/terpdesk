import { Download } from "lucide-react";

/** The optional CSV download for a tab: a quiet link, so the ledger on screen stays the main thing. */
export const ExportLink = ({ kind, periodId, label }: { kind: "payroll" | "invoices"; periodId: string; label: string }) => (
  <a
    href={`/api/billing/export?kind=${kind}&period=${encodeURIComponent(periodId)}`}
    className="-my-3.5 inline-flex items-center gap-1.5 py-3.5 text-xs font-medium text-[var(--sage)] hover:text-[var(--ink)]"
  >
    <Download className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </a>
);
