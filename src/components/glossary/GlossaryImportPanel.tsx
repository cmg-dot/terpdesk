"use client";

import { useRef, useState } from "react";
import { importGlossaryCsv } from "@/app/actions/glossary";
import type { ImportGlossaryResult } from "@/app/actions/glossary";
import { GLOSSARY_CSV_HEADER } from "@/lib/glossary";
import { MAX_IMPORT_CHARS } from "@/lib/glossaryImport";

interface Props {
  /** Called after terms were added, so the board reloads its list. */
  onImported: () => void;
  onClose: () => void;
}

const describe = (r: Extract<ImportGlossaryResult, { success: true }>): string => {
  const parts = [`${r.added} ${r.added === 1 ? "term" : "terms"} added`];
  if (r.duplicates > 0) parts.push(`${r.duplicates} already in your glossary`);
  if (r.invalid > 0) parts.push(`${r.invalid} skipped (missing or invalid, or repeated in the file)`);
  if (r.overLimit > 0) parts.push(`${r.overLimit} not added (glossary limit reached)`);
  return `${parts.join(", ")}.`;
};

/** Import a CSV file: the same columns the export writes. The file is read in the browser and checked again, row by row, on the server. */
export function GlossaryImportPanel({ onImported, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setMessage(null);
    if (file.size > MAX_IMPORT_CHARS * 4) {
      setMessage({ ok: false, text: "That file is too large. Import up to about 2,000 terms at a time." });
      return;
    }
    setBusy(true);
    try {
      const result = await importGlossaryCsv(await file.text());
      if (result.success) {
        setMessage({ ok: true, text: describe(result) });
        if (result.added > 0) onImported();
      } else setMessage({ ok: false, text: result.error });
    } catch {
      setMessage({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <section data-glossary-import="" aria-label="Import terms from a CSV file" className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-[var(--ink)]">Import from a CSV file</h2>
      <p className="text-[13px] leading-relaxed text-[var(--sage)]">
        The first row names the columns: {GLOSSARY_CSV_HEADER.join(", ")}. Only Source term and Target rendering are required; languages default to English and ASL. A file from
        Export CSV works as a template. Up to about 2,000 terms at a time. Please keep client names and patient details out of the file.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[var(--forest)] px-6 text-[14px] font-medium text-white transition-colors hover:opacity-90 sm:min-h-10">
          {busy ? "Importing..." : "Choose a CSV file"}
          <input ref={input} type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void choose(e.target.files?.[0])} className="sr-only" aria-label="Choose a CSV file to import" />
        </label>
        <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-full border border-gray-200 bg-white px-6 text-[14px] font-medium text-gray-700 hover:bg-gray-50 sm:min-h-10">
          Close
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2.5 text-[13px] font-medium ${message.ok ? "bg-[var(--tint)] text-[var(--tint-ink)]" : "border border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
