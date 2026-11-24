"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { interpreterGlossaryTerms } from "@/db/glossarySchema";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { toGlossaryTermView } from "@/lib/glossary";
import type { GlossaryTermView } from "@/lib/glossary";
import { parseGlossaryCsv } from "@/lib/glossaryImport";
import { readGlossaryTerms } from "@/lib/glossaryStore";
import { logError } from "@/lib/logError";
import { MAX_GLOSSARY_TERMS, parseGlossaryTerm } from "@/lib/validation/glossaryTerm";
import type { GlossaryTermField, GlossaryTermInput } from "@/lib/validation/glossaryTerm";

/**
 * An interpreter's own glossary. Every action starts with requireInterpreter() and works only on rows where interpreter_id is the
 * signed-in interpreter's own: an id from the browser never widens that. The audit log gets the action, ids and counts, never a term,
 * a rendering or a note.
 */

export type SaveGlossaryTermResult =
  | { success: true; term: GlossaryTermView }
  | { success: false; error: string; fieldErrors?: Partial<Record<GlossaryTermField, string>> };
export type DeleteGlossaryTermResult = { success: true } | { success: false; error: string };
export type ImportGlossaryResult =
  | { success: true; added: number; duplicates: number; invalid: number; overLimit: number }
  | { success: false; error: string };

const idSchema = z.string().uuid();
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before building a glossary.";
const NOT_FOUND = "That term could not be found.";
const NOT_READY = "The glossary is not set up on this database yet. Please check back soon.";
const TOO_MANY = `You have reached the limit of ${MAX_GLOSSARY_TERMS.toLocaleString("en-US")} terms. Delete some to add more.`;
const DUPLICATE = "You already have this term with this rendering in this language pair.";
const GENERIC_FAILURE = "We could not save that. Please try again.";
const CHUNK = 500;

const me = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

/** Postgres "unique_violation", which Drizzle reports on the error itself or on its `cause`. */
const isDuplicate = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
};

const refresh = () => revalidatePath("/prep");

/** The signed-in interpreter's glossary, newest first (at most the cap). The board calls it after an import. */
export async function listMyGlossaryTerms(): Promise<GlossaryTermView[]> {
  const { interpreterId } = await requireInterpreter();
  return readGlossaryTerms(interpreterId);
}

/** Adds a term, or updates one of the interpreter's own when `id` is given. */
export async function saveGlossaryTerm(input: GlossaryTermInput & { id?: string }): Promise<SaveGlossaryTermResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const { interpreterId, session } = own;

  const parsed = parseGlossaryTerm(input);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  const values = parsed.data;

  try {
    let saved;
    if (input.id !== undefined) {
      if (!idSchema.safeParse(input.id).success) return { success: false, error: NOT_FOUND };
      [saved] = await db
        .update(interpreterGlossaryTerms)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(interpreterGlossaryTerms.id, input.id), eq(interpreterGlossaryTerms.interpreterId, interpreterId)))
        .returning();
      if (!saved) return { success: false, error: NOT_FOUND };
    } else {
      const [row] = await db.select({ total: count() }).from(interpreterGlossaryTerms).where(eq(interpreterGlossaryTerms.interpreterId, interpreterId));
      if (Number(row?.total ?? 0) >= MAX_GLOSSARY_TERMS) return { success: false, error: TOO_MANY };
      [saved] = await db.insert(interpreterGlossaryTerms).values({ interpreterId, ...values }).returning();
      if (!saved) return { success: false, error: GENERIC_FAILURE };
    }
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: input.id !== undefined ? "glossary_term_updated" : "glossary_term_created",
      details: `termId=${saved.id}`,
    });
    refresh();
    return { success: true, term: toGlossaryTermView(saved) };
  } catch (err) {
    if (isDuplicate(err)) return { success: false, error: DUPLICATE, fieldErrors: { rendering: DUPLICATE } };
    if (isMissingTable(err)) return { success: false, error: NOT_READY };
    logError("saveGlossaryTerm", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/** Deletes one of the interpreter's own terms. Another interpreter's id, or an unknown one, is "not found". */
export async function deleteGlossaryTerm(id: string): Promise<DeleteGlossaryTermResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!idSchema.safeParse(id).success) return { success: false, error: NOT_FOUND };
  try {
    const removed = await db
      .delete(interpreterGlossaryTerms)
      .where(and(eq(interpreterGlossaryTerms.id, id), eq(interpreterGlossaryTerms.interpreterId, own.interpreterId)))
      .returning({ id: interpreterGlossaryTerms.id });
    if (removed.length === 0) return { success: false, error: NOT_FOUND };
    await writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action: "glossary_term_deleted", details: `termId=${id}` });
    refresh();
    return { success: true };
  } catch (err) {
    logError("deleteGlossaryTerm", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/**
 * Adds the terms in a CSV file (the export's own columns). Rows the form would refuse are skipped, duplicates of terms already kept are
 * skipped, and the 5,000-term limit is respected; the answer says how many of each. The file's contents are never logged.
 */
export async function importGlossaryCsv(text: string): Promise<ImportGlossaryResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const read = parseGlossaryCsv(typeof text === "string" ? text : "");
  if (read.problem) return { success: false, error: read.problem };

  try {
    const [row] = await db.select({ total: count() }).from(interpreterGlossaryTerms).where(eq(interpreterGlossaryTerms.interpreterId, own.interpreterId));
    const room = Math.max(0, MAX_GLOSSARY_TERMS - Number(row?.total ?? 0));
    const take = read.rows.slice(0, room);
    let added = 0;
    for (let i = 0; i < take.length; i += CHUNK) {
      const inserted = await db
        .insert(interpreterGlossaryTerms)
        .values(take.slice(i, i + CHUNK).map((v) => ({ interpreterId: own.interpreterId, ...v })))
        .onConflictDoNothing()
        .returning({ id: interpreterGlossaryTerms.id });
      added += inserted.length;
    }
    const duplicates = take.length - added;
    const overLimit = read.rows.length - take.length;
    await writeAuditLog({
      userId: own.session.user.id,
      userEmail: own.session.user.email ?? null,
      action: "glossary_imported",
      details: `added=${added}; duplicates=${duplicates}; invalid=${read.invalid}; overLimit=${overLimit}`,
    });
    refresh();
    return { success: true, added, duplicates, invalid: read.invalid, overLimit };
  } catch (err) {
    if (isMissingTable(err)) return { success: false, error: NOT_READY };
    logError("importGlossaryCsv", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}
