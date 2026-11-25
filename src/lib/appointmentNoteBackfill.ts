import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import type { RequestData } from "@/db/schema";
import { buildDraftData } from "@/lib/odhhDraft";
import { parseIntakeEmail } from "@/lib/odhhEmailParser";
import { parseFormExtras } from "@/lib/odhhFormFields";
import { lockRequestForPosition } from "@/lib/positionClaim";
import { logActivity } from "@/lib/requestActivity";

/**
 * Restores the Appointment Note of jobs the old rule left blank (a note that repeated the form's section-5 "Comment:" was dropped from
 * the preparation notes). The note is read again from the email saved on the job (`source.rawContent`) exactly as a new job reads it
 * (same parser, same scrub of ID numbers), and put in ONLY when the job's preparation notes are blank: nothing already written is
 * ever changed, and nothing else on the job is touched. A REHEARSAL (apply = false) does every step inside a transaction and rolls it
 * back, so it shows what would happen and changes nothing. SERVER ONLY. HIPAA: results carry request ids and fixed labels, never text.
 */

type Bag = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const bag = (value: unknown): Bag => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Bag) : {});

export type BackfillOutcome = "restored" | "already_has_notes" | "no_note_on_form" | "no_stored_email" | "closed" | "no_job";
export interface BackfillRow {
  srn: string;
  outcome: BackfillOutcome;
  requestId: string | null;
}

/** The job's data with its note restored, or why not. Pure. */
export function planNoteBackfill(status: string, data: Bag): { outcome: BackfillOutcome; data?: Bag } {
  if (/^cancell?ed$/i.test(status.trim())) return { outcome: "closed" };
  const source = bag(data.source);
  const raw = text(source.rawContent);
  if (!raw) return { outcome: "no_stored_email" };
  if (text(data.prepNotes)) return { outcome: "already_has_notes" };
  const subject = text(source.subject);
  const parsed = parseIntakeEmail(raw, subject);
  const now = new Date();
  const form = buildDraftData({ parsed, extras: parseFormExtras(raw), srn: parsed.srn, fromEmail: "", subject, rawContent: raw, contentHash: "", receivedAt: now.toISOString(), warnings: [], startsAt: now, endsAt: now });
  const note = text(form.prepNotes);
  return note ? { outcome: "restored", data: { ...data, prepNotes: note } } : { outcome: "no_note_on_form" };
}

class Rehearsal extends Error {}

export async function backfillAppointmentNotes(srns: readonly string[], apply: boolean): Promise<BackfillRow[]> {
  const rows: BackfillRow[] = [];
  for (const srn of srns) {
    const [job] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(eq(sql<string>`${requests.data}->'intake'->>'odhhSrn'`, srn))
      .orderBy(desc(requests.updatedAt))
      .limit(1);
    if (!job) {
      rows.push({ srn, outcome: "no_job", requestId: null });
      continue;
    }
    const result: { outcome: BackfillOutcome } = { outcome: "no_job" };
    try {
      await db.transaction(async (tx) => {
        const locked = await lockRequestForPosition(tx, job.id);
        if (!locked) return;
        const plan = planNoteBackfill(locked.status, locked.data);
        result.outcome = plan.outcome;
        if (plan.data) await tx.update(requests).set({ data: plan.data as RequestData, updatedAt: new Date() }).where(eq(requests.id, job.id));
        if (!apply) throw new Rehearsal();
      });
    } catch (error) {
      if (!(error instanceof Rehearsal)) throw error;
    }
    if (apply && result.outcome === "restored") {
      await logActivity({ requestId: job.id, kind: "form_enriched", audience: "agency", message: "Filled from the state's request form: prepNotes", actorLabel: "Email intake" });
    }
    rows.push({ srn, outcome: result.outcome, requestId: job.id });
  }
  return rows;
}
