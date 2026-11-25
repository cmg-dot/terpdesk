import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ceuEntries, renewalCycles } from "@/db/ceuSchema";
import { toCycleView, toEntryView } from "@/lib/ceu";
import type { CeuView } from "@/lib/ceu";
import { MAX_CYCLES, MAX_ENTRIES } from "@/lib/validation/ceu";

/**
 * Plain server code (not a Server Action): the one read of an interpreter's renewal cycles and CEU log, shared by the tab's loader and
 * the CSV export. It is scoped to the interpreter id its CALLER took from the session (requireInterpreter), never from the browser.
 */
export async function readCeu(interpreterId: string): Promise<CeuView> {
  const [cycles, entries] = await Promise.all([
    db.select().from(renewalCycles).where(eq(renewalCycles.interpreterId, interpreterId)).orderBy(desc(renewalCycles.cycleEnd)).limit(MAX_CYCLES),
    db.select().from(ceuEntries).where(eq(ceuEntries.interpreterId, interpreterId)).orderBy(desc(ceuEntries.earnedOn), desc(ceuEntries.createdAt)).limit(MAX_ENTRIES),
  ]);
  return { cycles: cycles.map(toCycleView), entries: entries.map(toEntryView) };
}
