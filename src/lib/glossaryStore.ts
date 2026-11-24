import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreterGlossaryTerms } from "@/db/glossarySchema";
import { toGlossaryTermView } from "@/lib/glossary";
import type { GlossaryTermView } from "@/lib/glossary";
import { MAX_GLOSSARY_TERMS } from "@/lib/validation/glossaryTerm";

/**
 * Plain server code (not a Server Action): the one read of an interpreter's glossary, shared by the Prep page and the CSV export. It is
 * scoped to the interpreter id its CALLER took from the session (requireInterpreter), never from the browser.
 */
export async function readGlossaryTerms(interpreterId: string): Promise<GlossaryTermView[]> {
  const rows = await db
    .select()
    .from(interpreterGlossaryTerms)
    .where(eq(interpreterGlossaryTerms.interpreterId, interpreterId))
    .orderBy(desc(interpreterGlossaryTerms.createdAt))
    .limit(MAX_GLOSSARY_TERMS);
  return rows.map(toGlossaryTermView);
}
