"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ceuEntries, renewalCycles } from "@/db/ceuSchema";
import { credentials } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import { toCycleView, toEntryView } from "@/lib/ceu";
import type { CycleView, EntryView } from "@/lib/ceu";
import { loadCeu } from "@/lib/ceuData";
import type { CeuData } from "@/lib/ceuData";
import { cycleChangeBlocked, entryOutsideCycle } from "@/lib/ceuRules";
import { logError } from "@/lib/logError";
import { MAX_CYCLES, MAX_ENTRIES, parseCycle, parseEntry } from "@/lib/validation/ceu";
import type { CycleField, CycleInput, EntryField, EntryInput, FieldErrors } from "@/lib/validation/ceu";

/**
 * An interpreter's private renewal cycles and CEU log. Every action starts with requireInterpreter() and works only on rows where
 * interpreter_id is the signed-in interpreter's own: an id from the browser never widens that. The audit log gets the action and ids,
 * never a label, a title or a provider.
 */

export type SaveCycleResult = { success: true; cycle: CycleView } | { success: false; error: string; fieldErrors?: FieldErrors<CycleField> };
export type SaveEntryResult = { success: true; entry: EntryView } | { success: false; error: string; fieldErrors?: FieldErrors<EntryField> };
export type DeleteResult = { success: true } | { success: false; error: string };

const idSchema = z.string().uuid();
const NOT_LINKED = "Connect your interpreter profile (use the link we emailed you) before tracking renewals.";
const NOT_FOUND = "We could not find that. It may have been deleted already.";
const NOT_READY = "Renewal tracking is not set up on this database yet. Please check back soon.";
const TOO_MANY_CYCLES = `You have reached the limit of ${MAX_CYCLES} cycles. Delete one you no longer need to add another.`;
const TOO_MANY_ENTRIES = `You have reached the limit of ${MAX_ENTRIES.toLocaleString("en-US")} logged entries. Delete some to add more.`;
const GENERIC_FAILURE = "We could not save that. Please try again.";
const BAD_CREDENTIAL = "Choose a credential from the list.";
const BAD_CYCLE = "Choose a cycle from the list.";

const me = async () => {
  try {
    return await requireInterpreter();
  } catch {
    return null;
  }
};

const two = (n: number | null): string | null => (n === null ? null : n.toFixed(2));
type Own = NonNullable<Awaited<ReturnType<typeof me>>>;
const audit = (own: Own, action: string, details: string) =>
  writeAuditLog({ userId: own.session.user.id, userEmail: own.session.user.email ?? null, action, details });

/** The signed-in interpreter's cycles and log, or why not. The tab calls it when it opens. */
export async function loadMyCeu(): Promise<CeuData> {
  return loadCeu();
}

/** Adds a renewal cycle, or updates one of the interpreter's own when `id` is given. */
export async function saveCycle(input: CycleInput & { id?: string }): Promise<SaveCycleResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const parsed = parseCycle(input);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  const v = parsed.data;
  const mine = eq(renewalCycles.interpreterId, own.interpreterId);

  try {
    if (v.credentialId) {
      const [owned] = await db.select({ id: credentials.id }).from(credentials).where(and(eq(credentials.id, v.credentialId), eq(credentials.interpreterId, own.interpreterId)));
      if (!owned) return { success: false, error: BAD_CREDENTIAL, fieldErrors: { credentialId: BAD_CREDENTIAL } };
    }
    const values = {
      label: v.label, credentialId: v.credentialId, cycleStart: v.cycleStart, cycleEnd: v.cycleEnd, unit: v.unit,
      requiredTotal: two(v.requiredTotal), requiredEthics: two(v.requiredEthics), requiredPpo: two(v.requiredPpo),
    };
    let saved;
    if (input.id !== undefined) {
      if (!idSchema.safeParse(input.id).success) return { success: false, error: NOT_FOUND };
      const assigned = await db
        .select({ earnedOn: ceuEntries.earnedOn, unit: ceuEntries.unit })
        .from(ceuEntries)
        .where(and(eq(ceuEntries.cycleId, input.id), eq(ceuEntries.interpreterId, own.interpreterId)));
      const blocked = cycleChangeBlocked(v, assigned);
      if (blocked) return { success: false, error: blocked, fieldErrors: { form: blocked } };
      [saved] = await db.update(renewalCycles).set({ ...values, updatedAt: new Date() }).where(and(eq(renewalCycles.id, input.id), mine)).returning();
      if (!saved) return { success: false, error: NOT_FOUND };
    } else {
      const [row] = await db.select({ total: count() }).from(renewalCycles).where(mine);
      if (Number(row?.total ?? 0) >= MAX_CYCLES) return { success: false, error: TOO_MANY_CYCLES };
      [saved] = await db.insert(renewalCycles).values({ interpreterId: own.interpreterId, ...values }).returning();
      if (!saved) return { success: false, error: GENERIC_FAILURE };
    }
    await audit(own, input.id !== undefined ? "ceu_cycle_updated" : "ceu_cycle_created", `cycleId=${saved.id}`);
    return { success: true, cycle: toCycleView(saved) };
  } catch (err) {
    if (isMissingTable(err)) return { success: false, error: NOT_READY };
    logError("saveCycle", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/** Deletes one of the interpreter's own cycles. Its entries stay in the log, with no cycle. */
export async function deleteCycle(id: string): Promise<DeleteResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!idSchema.safeParse(id).success) return { success: false, error: NOT_FOUND };
  try {
    const removed = await db
      .delete(renewalCycles)
      .where(and(eq(renewalCycles.id, id), eq(renewalCycles.interpreterId, own.interpreterId)))
      .returning({ id: renewalCycles.id });
    if (removed.length === 0) return { success: false, error: NOT_FOUND };
    await audit(own, "ceu_cycle_deleted", `cycleId=${id}`);
    return { success: true };
  } catch (err) {
    logError("deleteCycle", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/** Logs a CEU entry, or updates one of the interpreter's own when `id` is given. In a cycle it takes the cycle's unit and must fall inside its dates. */
export async function saveEntry(input: EntryInput & { id?: string }): Promise<SaveEntryResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  const parsed = parseEntry(input);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  const v = parsed.data;
  const mine = eq(ceuEntries.interpreterId, own.interpreterId);

  try {
    let unit = v.unit;
    if (v.cycleId) {
      const [cycle] = await db.select().from(renewalCycles).where(and(eq(renewalCycles.id, v.cycleId), eq(renewalCycles.interpreterId, own.interpreterId)));
      if (!cycle) return { success: false, error: BAD_CYCLE, fieldErrors: { cycleId: BAD_CYCLE } };
      const outside = entryOutsideCycle(v.earnedOn, cycle);
      if (outside) return { success: false, error: outside, fieldErrors: { earnedOn: outside } };
      unit = cycle.unit;
    }
    const values = {
      title: v.title, provider: v.provider, category: v.category, earnedOn: v.earnedOn, amount: v.amount.toFixed(2), unit,
      cycleId: v.cycleId, isEthics: v.isEthics, isPpo: v.isPpo,
    };
    let saved;
    if (input.id !== undefined) {
      if (!idSchema.safeParse(input.id).success) return { success: false, error: NOT_FOUND };
      [saved] = await db.update(ceuEntries).set({ ...values, updatedAt: new Date() }).where(and(eq(ceuEntries.id, input.id), mine)).returning();
      if (!saved) return { success: false, error: NOT_FOUND };
    } else {
      const [row] = await db.select({ total: count() }).from(ceuEntries).where(mine);
      if (Number(row?.total ?? 0) >= MAX_ENTRIES) return { success: false, error: TOO_MANY_ENTRIES };
      [saved] = await db.insert(ceuEntries).values({ interpreterId: own.interpreterId, ...values }).returning();
      if (!saved) return { success: false, error: GENERIC_FAILURE };
    }
    await audit(own, input.id !== undefined ? "ceu_entry_updated" : "ceu_entry_created", `entryId=${saved.id}`);
    return { success: true, entry: toEntryView(saved) };
  } catch (err) {
    if (isMissingTable(err)) return { success: false, error: NOT_READY };
    logError("saveEntry", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}

/** Deletes one of the interpreter's own entries. Another interpreter's id, or an unknown one, is "not found". */
export async function deleteEntry(id: string): Promise<DeleteResult> {
  const own = await me();
  if (!own) return { success: false, error: NOT_LINKED };
  if (!idSchema.safeParse(id).success) return { success: false, error: NOT_FOUND };
  try {
    const removed = await db
      .delete(ceuEntries)
      .where(and(eq(ceuEntries.id, id), eq(ceuEntries.interpreterId, own.interpreterId)))
      .returning({ id: ceuEntries.id });
    if (removed.length === 0) return { success: false, error: NOT_FOUND };
    await audit(own, "ceu_entry_deleted", `entryId=${id}`);
    return { success: true };
  } catch (err) {
    logError("deleteEntry", err);
    return { success: false, error: GENERIC_FAILURE };
  }
}
