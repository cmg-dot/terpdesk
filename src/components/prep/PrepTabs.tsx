"use client";

import { useState } from "react";
import { GlossaryBoard } from "@/components/glossary/GlossaryBoard";
import { PrepMaterialsTab } from "@/components/prep/PrepMaterialsTab";
import type { GlossaryData } from "@/lib/glossaryData";
import type { InterpreterPrepFile } from "@/lib/validation/file";

type PrepTab = "materials" | "glossary";

const GLOSSARY_PROBLEMS = {
  not_ready: "The glossary is not set up on this database yet. Please check back soon.",
  not_linked: "Connect your interpreter profile (use the link we emailed you) before building a glossary.",
  error: "We couldn't load your glossary. Please refresh the page.",
} as const;

interface PrepTabsProps {
  files: InterpreterPrepFile[];
  glossary: GlossaryData;
}

/**
 * The Prep page's two tabs: the materials agencies shared for booked jobs, and the interpreter's own glossary. Both stay mounted (the
 * other is only hidden), so a search or an open form survives a switch. With no shared materials the glossary is the tab that opens.
 */
export function PrepTabs({ files, glossary }: PrepTabsProps) {
  const [tab, setTab] = useState<PrepTab>(files.length > 0 ? "materials" : "glossary");
  const tabs: { id: PrepTab; label: string }[] = [
    { id: "materials", label: "Job materials" },
    { id: "glossary", label: "My glossary" },
  ];

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Prep sections" className="flex flex-wrap gap-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`prep-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`prep-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`min-h-11 rounded-full border px-5 text-sm font-medium transition-colors sm:min-h-10 ${
              tab === t.id ? "border-[var(--forest)] bg-[var(--forest)] text-[var(--canvas)]" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="prep-panel-materials" aria-labelledby="prep-tab-materials" hidden={tab !== "materials"}>
        <PrepMaterialsTab files={files} />
      </div>
      <div role="tabpanel" id="prep-panel-glossary" aria-labelledby="prep-tab-glossary" hidden={tab !== "glossary"}>
        {glossary.status === "ok" ? (
          <GlossaryBoard initialTerms={glossary.terms} />
        ) : (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            {GLOSSARY_PROBLEMS[glossary.status]}
          </div>
        )}
      </div>
    </div>
  );
}
