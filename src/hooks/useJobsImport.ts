"use client";

import { useCallback, useRef, useState } from "react";
import { importHistoricalJobs } from "@/app/actions/importHistoricalJobs";
import { useTwoStepImport } from "@/hooks/useTwoStepImport";
import type { ImportMode } from "@/hooks/useTwoStepImport";
import type { JobsReport } from "@/lib/jobImport/types";

/**
 * The historical-jobs import: the shared two-step flow plus one choice, whether a name that is only the start of one
 * roster person's name ("Karen") may be linked to them. Changing it re-checks the file so the preview always matches.
 */
export const useJobsImport = () => {
  const [allowPartial, setAllowPartialState] = useState(true);
  const partialRef = useRef(true);

  const flow = useTwoStepImport<JobsReport>((file: File, mode: ImportMode) => {
    const data = new FormData();
    data.set("file", file);
    data.set("mode", mode);
    data.set("allowPartial", String(partialRef.current));
    return importHistoricalJobs(data);
  });

  const setAllowPartial = useCallback(
    (next: boolean) => {
      partialRef.current = next;
      setAllowPartialState(next);
      flow.recheck();
    },
    [flow],
  );

  return { ...flow, allowPartial, setAllowPartial };
};
