"use client";

import { useState } from "react";
import { JobsImportPanel } from "@/components/admin/JobsImportPanel";
import { WorkbookImportPanel } from "@/components/admin/WorkbookImportPanel";

type Tab = "roster" | "jobs";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "roster", label: "Import interpreters", blurb: "Add interpreters and their State, King County and Non-state rates, plus certification and insurance, from the two roster sheets." },
  { id: "jobs", label: "Import historical jobs", blurb: "Add the jobs from the Jobs sheet, booked to the interpreters named on each row. Import the interpreters first so their names can be matched." },
];

/** The /admin/import screen: one workbook, two separate imports. Each tab keeps its own file and result. */
export const ImportWorkspace = () => {
  const [tab, setTab] = useState<Tab>("roster");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="What to import" className="inline-flex rounded-full border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`import-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`import-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${tab === t.id ? "bg-[#0B3B32] text-white" : "text-gray-700 hover:bg-gray-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">{active.blurb}</p>
      {/* Both stay mounted (the inactive one is only hidden), so switching tabs never loses a file or a preview. */}
      <div role="tabpanel" id="import-panel-roster" aria-labelledby="import-tab-roster" hidden={tab !== "roster"}>
        <WorkbookImportPanel />
      </div>
      <div role="tabpanel" id="import-panel-jobs" aria-labelledby="import-tab-jobs" hidden={tab !== "jobs"}>
        <JobsImportPanel />
      </div>
    </div>
  );
};
