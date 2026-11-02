"use client";

import { useState } from "react";
import { JobsImportPanel } from "@/components/admin/JobsImportPanel";
import { WorkbookImportPanel } from "@/components/admin/WorkbookImportPanel";

type Tab = "roster" | "jobs";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "roster", label: "Import interpreters", blurb: "Add interpreters and their State, King County and Non-state rates, plus certification and insurance, from the two roster sheets." },
  { id: "jobs", label: "Import historical jobs", blurb: "Add the jobs from the sheet whose name contains \"Job\", booked to the interpreters named on each row. Import the interpreters first so their names can be matched." },
];

/**
 * The /admin/import screen: one workbook, two completely separate imports. Only the active tab is on the page, each with
 * its own state, its own file input and its own server action, so a file, a validation message or an error from one tab
 * can never show up in (or be sent by) the other. Switching tabs starts the other import afresh.
 * On a phone the two tabs stack full-width (neither can run off the screen); from the sm breakpoint up they sit in one pill.
 */
export const ImportWorkspace = () => {
  const [tab, setTab] = useState<Tab>("roster");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="What to import"
        className="flex w-full flex-col gap-1 rounded-2xl border border-gray-200 bg-white p-1 sm:inline-flex sm:w-auto sm:flex-row sm:rounded-full"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`import-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`import-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`w-full rounded-xl px-4 py-2.5 text-center text-[13px] font-medium transition-colors sm:w-auto sm:rounded-full sm:px-5 sm:py-2 sm:text-sm ${tab === t.id ? "bg-[#0B3B32] text-white" : "text-gray-700 hover:bg-gray-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">{active.blurb}</p>
      <div key={tab} role="tabpanel" id={`import-panel-${tab}`} aria-labelledby={`import-tab-${tab}`}>
        {tab === "roster" ? <WorkbookImportPanel /> : <JobsImportPanel />}
      </div>
    </div>
  );
};
