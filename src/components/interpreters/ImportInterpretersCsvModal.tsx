"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, mapColumns, validateImportRecords } from "@/lib/interpreterImport";
import type { BulkImportResponse, ValidatedImport } from "@/lib/interpreterImport";

type ImportDone = Extract<BulkImportResponse, { success: true }>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so the page can refresh the roster. */
  onImported: (result: ImportDone) => void;
}

const SHOWN_PROBLEMS = 5;
const secondaryButton = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const primaryButton = "rounded-full bg-[#0B3B32] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:opacity-60";

/**
 * "Import CSV": reads a spreadsheet export in the browser (papaparse), checks every row has a valid Name and Email,
 * shows what will happen, and only then sends the clean rows to /api/interpreters/bulk-import. Nothing is uploaded as a
 * file: just the validated Name / Email / Phone values.
 */
export function ImportInterpretersCsvModal({ isOpen, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ValidatedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setError(null);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleFile = (file: File | undefined) => {
    setParsed(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("That file is too large (over 1 MB). Split it into smaller files.");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      // Blank rows are kept (and ignored by the validator) so reported line numbers match the spreadsheet.
      skipEmptyLines: false,
      transformHeader: (header) => header.replace(/^﻿/, "").trim(),
      complete: (results) => {
        const columns = mapColumns(results.meta.fields ?? []);
        if (!columns) {
          setError("We couldn't find the Name and Email columns. The first row must have headers: Name, Email, Phone.");
          return;
        }
        if (results.data.length === 0) {
          setError("That file has no rows to import.");
          return;
        }
        if (results.data.length > MAX_IMPORT_ROWS) {
          setError(`That file has ${results.data.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`);
          return;
        }
        setParsed(validateImportRecords(results.data, columns));
      },
      error: () => setError("We couldn't read that file. Export it from your spreadsheet as CSV and try again."),
    });
  };

  const submit = async () => {
    if (!parsed || parsed.rows.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/interpreters/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const result = (await response.json().catch(() => null)) as BulkImportResponse | null;
      if (!result || !result.success) {
        setError(result && !result.success ? result.error : "The import didn't go through. Please try again.");
        setBusy(false);
        return;
      }
      onImported(result);
      reset();
      onClose();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  const problems = parsed?.problems ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import interpreters from CSV</DialogTitle>
          <DialogDescription>
            Create shadow profiles in bulk. The first row must be headers: <strong>Name</strong>, <strong>Email</strong>, Phone. Anyone whose email is
            already in terpDESK is skipped and left unchanged.
          </DialogDescription>
        </DialogHeader>

        <label
          htmlFor="interpreter-csv"
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-700 hover:bg-gray-100"
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#0B3B32]" aria-hidden="true" />
          <span className="truncate">{fileName ?? "Choose a .csv file"}</span>
        </label>
        <input
          id="interpreter-csv"
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}

        {parsed && (
          <div role="status" className="mt-4 space-y-2 text-sm text-gray-800">
            <p>
              <strong>{parsed.rows.length}</strong> {parsed.rows.length === 1 ? "person is" : "people are"} ready to import.
            </p>
            {parsed.duplicatesInFile > 0 && (
              <p className="text-gray-600">{parsed.duplicatesInFile} repeated email{parsed.duplicatesInFile === 1 ? "" : "s"} in the file will be ignored.</p>
            )}
            {problems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">{problems.length} row{problems.length === 1 ? "" : "s"} will be skipped:</p>
                <ul className="mt-1 list-disc pl-5 text-[13px]">
                  {problems.slice(0, SHOWN_PROBLEMS).map((p) => (
                    <li key={p.line}>Line {p.line}: {p.reason}</li>
                  ))}
                </ul>
                {problems.length > SHOWN_PROBLEMS && <p className="mt-1 text-[13px]">…and {problems.length - SHOWN_PROBLEMS} more.</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button type="button" onClick={close} disabled={busy} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !parsed || parsed.rows.length === 0} className={primaryButton}>
            {busy ? "Importing…" : parsed && parsed.rows.length > 0 ? `Import ${parsed.rows.length}` : "Import"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
