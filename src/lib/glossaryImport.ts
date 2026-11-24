import Papa from "papaparse";
import { parseGlossaryTerm } from "@/lib/validation/glossaryTerm";
import type { GlossaryTermValues } from "@/lib/validation/glossaryTerm";

/**
 * Reads a glossary CSV (the export's own columns, or the short names term and rendering) into checked terms. Pure. Every row goes through
 * the same parse as the form, so a row the form would refuse is counted as invalid and skipped, never stored. Duplicates inside the
 * file are dropped here; duplicates of terms already stored are dropped by the database (a unique index) and counted by the action.
 */

/** The biggest file read (text characters) and the most rows one import will take. */
export const MAX_IMPORT_CHARS = 400_000;
export const MAX_IMPORT_ROWS = 2000;

const COLUMNS: Record<string, "term" | "rendering" | "sourceLang" | "targetLang" | "setting" | "note"> = {
  "source term": "term", term: "term",
  "target rendering": "rendering", rendering: "rendering",
  "source language": "sourceLang", "target language": "targetLang",
  setting: "setting",
  "context note": "note", note: "note",
};

export interface GlossaryImportRead {
  /** Set when the file as a whole cannot be used. */
  problem: string | null;
  rows: GlossaryTermValues[];
  /** Rows that did not pass the form's checks (or repeated a row earlier in the file). */
  invalid: number;
}

const keyOf = (v: GlossaryTermValues): string => [v.sourceLang, v.targetLang, v.term.toLowerCase(), v.rendering.toLowerCase()].join("\u0000");

export function parseGlossaryCsv(text: string): GlossaryImportRead {
  const empty = (problem: string): GlossaryImportRead => ({ problem, rows: [], invalid: 0 });
  if (typeof text !== "string" || text.trim() === "") return empty("The file is empty.");
  if (text.length > MAX_IMPORT_CHARS) return empty("That file is too large. Import up to about 2,000 terms at a time.");

  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const known = (parsed.meta.fields ?? []).filter((f) => COLUMNS[f] !== undefined);
  if (!known.some((f) => COLUMNS[f] === "term") || !known.some((f) => COLUMNS[f] === "rendering")) {
    return empty("The first row must name the columns, including Source term and Target rendering.");
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) return empty(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files.`);

  const seen = new Set<string>();
  const rows: GlossaryTermValues[] = [];
  let invalid = 0;
  for (const raw of parsed.data) {
    const input: Record<string, string | undefined> = {};
    for (const field of known) {
      const value = (raw[field] ?? "").trim();
      // A blank language falls back to the form's default pair; a blank anything else is "not stated".
      if (value !== "" || COLUMNS[field] === "term" || COLUMNS[field] === "rendering") input[COLUMNS[field]] = value;
    }
    const check = parseGlossaryTerm(input);
    if (!check.ok) {
      invalid += 1;
      continue;
    }
    const key = keyOf(check.data);
    if (seen.has(key)) {
      invalid += 1;
      continue;
    }
    seen.add(key);
    rows.push(check.data);
  }
  return { problem: null, rows, invalid };
}
