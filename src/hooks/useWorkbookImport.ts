"use client";

import { importInterpreterWorkbook } from "@/app/actions/importInterpreterWorkbook";
import { useTwoStepImport } from "@/hooks/useTwoStepImport";
import type { ImportMode } from "@/hooks/useTwoStepImport";
import type { ImportReport } from "@/lib/workbookImport/types";

export type { ImportPhase } from "@/hooks/useTwoStepImport";

const send = (file: File, mode: ImportMode) => {
  const data = new FormData();
  data.set("file", file);
  data.set("mode", mode);
  return importInterpreterWorkbook(data);
};

/** The roster import (State and non-state sheets): the shared two-step flow wired to its server action. */
export const useWorkbookImport = () => useTwoStepImport<ImportReport>(send);
