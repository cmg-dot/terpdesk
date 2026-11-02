"use client";

import { useCallback, useState } from "react";
import { importInterpreterWorkbook } from "@/app/actions/importInterpreterWorkbook";
import { workbookImportInputSchema } from "@/lib/validation/workbookImport";
import type { ImportReport } from "@/lib/workbookImport/types";

export type ImportPhase = "idle" | "checking" | "checked" | "importing" | "done";

export interface WorkbookImportState {
  phase: ImportPhase;
  fileName: string | null;
  report: ImportReport | null;
  error: string | null;
  /** Reads the file on the server and shows what an import would do. Nothing is saved yet. */
  chooseFile: (file: File | undefined) => void;
  /** Saves it. Only available after a successful check. */
  confirmImport: () => void;
  reset: () => void;
}

const asFormData = (file: File, mode: "preview" | "import"): FormData => {
  const data = new FormData();
  data.set("file", file);
  data.set("mode", mode);
  return data;
};

/**
 * The two-step flow: choose a file (the server checks it and reports, saving nothing), then confirm (the server
 * reads the same file again and saves). The browser never sends parsed data: only the file itself.
 */
export const useWorkbookImport = (): WorkbookImportState => {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (chosen: File, mode: "preview" | "import") => {
    setError(null);
    setPhase(mode === "preview" ? "checking" : "importing");
    try {
      const result = await importInterpreterWorkbook(asFormData(chosen, mode));
      if (!result.success) {
        setError(result.error);
        // A failed check leaves nothing to confirm; a failed import can be retried from the same report.
        setPhase(mode === "preview" ? "idle" : "checked");
        return;
      }
      setReport(result.report);
      setPhase(mode === "preview" ? "checked" : "done");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again. (Files over about 4.5 MB can be refused by the hosting service before they arrive.)");
      setPhase(mode === "preview" ? "idle" : "checked");
    }
  }, []);

  const chooseFile = useCallback(
    (chosen: File | undefined) => {
      if (!chosen) return;
      setReport(null);
      const check = workbookImportInputSchema.safeParse({ file: chosen, mode: "preview" });
      if (!check.success) {
        setFile(null);
        setPhase("idle");
        setError(check.error.issues[0]?.message ?? "That file can't be imported.");
        return;
      }
      setFile(chosen);
      void run(chosen, "preview");
    },
    [run],
  );

  const confirmImport = useCallback(() => {
    if (file && phase === "checked") void run(file, "import");
  }, [file, phase, run]);

  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setReport(null);
    setError(null);
  }, []);

  return { phase, fileName: file?.name ?? null, report, error, chooseFile, confirmImport, reset };
};
