import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import type { GlossaryTermView } from "@/lib/glossary";
import { readGlossaryTerms } from "@/lib/glossaryStore";

/**
 * What the Prep page's Glossary tab needs, for the signed-in interpreter only (plain server code, called by the page):
 *  - "ok": their terms;
 *  - "not_ready": the table from migration 0015 is not on this database yet, so the tab says so instead of failing the page;
 *  - "not_linked": the login is not linked to an interpreter profile yet;
 *  - "error": anything else (logged by code only; nothing the interpreter typed is printed).
 */
export type GlossaryData = { status: "ok"; terms: GlossaryTermView[] } | { status: "not_ready" | "not_linked" | "error" };

export async function loadGlossary(): Promise<GlossaryData> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { status: "not_linked" };
  }
  try {
    return { status: "ok", terms: await readGlossaryTerms(interpreterId) };
  } catch (err) {
    if (isMissingTable(err)) return { status: "not_ready" };
    logError("loadGlossary", err);
    return { status: "error" };
  }
}
