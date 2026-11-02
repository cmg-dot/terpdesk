import Link from "next/link";
import { WorkbookImportPanel } from "@/components/admin/WorkbookImportPanel";

export const dynamic = "force-dynamic";

/** Agency-only (the middleware and the server action both enforce it): bulk-create interpreters and rates from Excel. */
export default function AdminImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
      <div>
        <Link href="/interpreters" className="text-[13px] font-medium text-[#0B3B32] hover:underline">← Interpreters</Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Import interpreters from Excel</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload the master workbook to add interpreters and their State, King County and Non-state hourly rates in one go. You&apos;ll see what will happen
          before anything is saved.
        </p>
      </div>
      <WorkbookImportPanel />
    </div>
  );
}
