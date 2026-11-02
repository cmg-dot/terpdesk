"use client";

import { useCallback, useRef, useState } from "react";
import { workbookImportInputSchema } from "@/lib/validation/workbookImport";

export type ImportPhase = "idle" | "checking" | "checked" | "importing" | "done";
export type ImportMode = "preview" | "import";
export type StepResult<R> = { success: true; report: R } | { success: false; error: string };

export interface TwoStepImport<R> {
  phase: ImportPhase;
  fileName: string | null;
  report: R | null;
  error: string | null;
  /** Reads the file on the server and shows what an import would do. Nothing is saved yet. */
  chooseFile: (file: File | undefined) => void;
  /** Checks the same file again (for example after an option changed). */
  recheck: () => void;
  /** Saves it. Only available after a successful check. */
  confirmImport: () => void;
  reset: () => void;
}

/**
 * The two-step flow shared by the Excel imports: choose a file (the server checks it and reports, saving nothing), then
 * confirm (the server reads the same file again and saves). The browser never sends parsed data: only the file itself.
 * `call` talks to the server action; the latest one is always used, so options it reads are never stale.
 */
export const useTwoStepImport = <R,>(call: (file: File, mode: ImportMode) => Promise<StepResult<R>>): TwoStepImport<R> => {
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef(call);
  callRef.current = call;

  const run = useCallback(async (chosen: File, mode: ImportMode) => {
    setError(null);
    setPhase(mode === "preview" ? "checking" : "importing");
    try {
      const result = await callRef.current(chosen, mode);
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

  const recheck = useCallback(() => {
    if (file && phase === "checked") void run(file, "preview");
  }, [file, phase, run]);

  const confirmImport = useCallback(() => {
    if (file && phase === "checked") void run(file, "import");
  }, [file, phase, run]);

  const reset = useCallback(() => {
    setPhase("idle");
    setFile(null);
    setReport(null);
    setError(null);
  }, []);

  return { phase, fileName: file?.name ?? null, report, error, chooseFile, recheck, confirmImport, reset };
};
