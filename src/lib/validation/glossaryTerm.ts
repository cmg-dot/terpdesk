import { z } from "zod";
import { FILTER_SETTINGS } from "@/lib/requestOptions";

/**
 * What the glossary form (and a CSV import row) sends, and the one parse that counts: the browser runs it for instant feedback, the server
 * runs it again. Pure.
 */

/** The most terms one interpreter can keep. */
export const MAX_GLOSSARY_TERMS = 5000;
export const TERM_MAX = 200;
export const RENDERING_MAX = 300;
export const NOTE_MAX = 300;
/** Shown under the note field. */
export const NOTE_HINT = "No client names or patient details";

/** The fixed list of languages a pair is chosen from. "Other" covers anything not listed. */
export const GLOSSARY_LANGUAGES = [
  "English", "ASL", "Spanish", "Mandarin", "Cantonese", "Vietnamese", "Russian", "Korean", "Tagalog", "Arabic", "Somali", "Amharic", "Ukrainian", "Other",
] as const;
export type GlossaryLanguage = (typeof GLOSSARY_LANGUAGES)[number];

export const glossaryTermSchema = z.object({
  term: z.string().trim().min(1, "Enter the source term.").max(TERM_MAX, `The term must be ${TERM_MAX} characters or fewer.`),
  rendering: z.string().trim().min(1, "Enter the target rendering.").max(RENDERING_MAX, `The rendering must be ${RENDERING_MAX} characters or fewer.`),
  sourceLang: z.string().trim().default("English").refine((v) => (GLOSSARY_LANGUAGES as readonly string[]).includes(v), "Choose a language from the list."),
  targetLang: z.string().trim().default("ASL").refine((v) => (GLOSSARY_LANGUAGES as readonly string[]).includes(v), "Choose a language from the list."),
  setting: z.string().trim().refine((v) => v === "" || FILTER_SETTINGS.includes(v), "Choose a setting from the list.").default(""),
  note: z.string().trim().max(NOTE_MAX, `The note must be ${NOTE_MAX} characters or fewer.`).default(""),
});

export type GlossaryTermInput = z.input<typeof glossaryTermSchema>;
export type GlossaryTermField = keyof GlossaryTermInput | "form";

/** A checked term, ready to store. */
export interface GlossaryTermValues {
  term: string;
  rendering: string;
  sourceLang: string;
  targetLang: string;
  setting: string | null;
  note: string | null;
}

export type GlossaryTermParse =
  | { ok: true; data: GlossaryTermValues }
  | { ok: false; error: string; fieldErrors: Partial<Record<GlossaryTermField, string>> };

export function parseGlossaryTerm(input: unknown): GlossaryTermParse {
  const parsed = glossaryTermSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const fieldErrors: Partial<Record<GlossaryTermField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field as GlossaryTermField]) fieldErrors[field as GlossaryTermField] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  if (v.sourceLang === v.targetLang && v.sourceLang !== "Other") {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { targetLang: "Choose a different language from the source." } };
  }
  return { ok: true, data: { term: v.term, rendering: v.rendering, sourceLang: v.sourceLang, targetLang: v.targetLang, setting: v.setting || null, note: v.note || null } };
}
