import type { SelectGlossaryTerm } from "@/db/glossarySchema";

/**
 * A glossary term as the browser sees it, and the CSV the export writes. Pure. The columns are named for both ASL and spoken-language use:
 * the source term (English, or whatever the source of the pair is) and the target rendering (for ASL a gloss or a short sign note).
 */

export interface GlossaryTermView {
  id: string;
  term: string;
  rendering: string;
  sourceLang: string;
  targetLang: string;
  setting: string;
  note: string;
  /** ISO text; the newest-first order uses it. */
  createdAt: string;
}

export const toGlossaryTermView = (row: SelectGlossaryTerm): GlossaryTermView => ({
  id: row.id,
  term: row.term,
  rendering: row.rendering,
  sourceLang: row.sourceLang,
  targetLang: row.targetLang,
  setting: row.setting ?? "",
  note: row.note ?? "",
  createdAt: row.createdAt.toISOString(),
});

/** "English to ASL". */
export const pairLabel = (term: Pick<GlossaryTermView, "sourceLang" | "targetLang">): string => `${term.sourceLang} to ${term.targetLang}`;

/** What the form holds (strings, as a form posts them). */
export interface GlossaryFormValues {
  term: string;
  rendering: string;
  sourceLang: string;
  targetLang: string;
  setting: string;
  note: string;
}

/** A new term starts in the pair and setting of the last one added, so a run of terms is quick to enter. */
export const emptyGlossaryForm = (sourceLang = "English", targetLang = "ASL", setting = ""): GlossaryFormValues => ({ term: "", rendering: "", sourceLang, targetLang, setting, note: "" });

export const glossaryFormValues = (t: GlossaryTermView): GlossaryFormValues => ({
  term: t.term, rendering: t.rendering, sourceLang: t.sourceLang, targetLang: t.targetLang, setting: t.setting, note: t.note,
});

/** The export's header row; the import reads the same names back (so an export is also the import template). */
export const GLOSSARY_CSV_HEADER = ["Source term", "Target rendering", "Source language", "Target language", "Setting", "Context note"] as const;

export const glossaryCsvRows = (terms: readonly GlossaryTermView[]): string[][] =>
  terms.map((t) => [t.term, t.rendering, t.sourceLang, t.targetLang, t.setting, t.note]);
