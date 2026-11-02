import Link from "next/link";
import { ImportWorkspace } from "@/components/admin/ImportWorkspace";

export const dynamic = "force-dynamic";
/** Importing a thousand jobs takes several seconds on the remote database: allow the server action up to a minute. */
export const maxDuration = 60;

/** Agency-only (the middleware and the server actions both enforce it): bulk-create interpreters and jobs from Excel. */
export default function AdminImportPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <div>
        <Link href="/interpreters" className="text-[13px] font-medium text-[#0B3B32] hover:underline">← Interpreters</Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Import from Excel</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload the agency&apos;s master workbook. Each import shows you what will happen before anything is saved.
        </p>
      </div>
      <ImportWorkspace />
    </div>
  );
}
