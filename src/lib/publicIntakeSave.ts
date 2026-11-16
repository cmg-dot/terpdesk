import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { summarizeJob } from "@/lib/jobSummary";
import { notifyAgencyAdmins } from "@/lib/notifications";
import type { PublicRequestDraft } from "@/lib/publicIntake";
import { logActivity } from "@/lib/requestActivity";
import { formatReference } from "@/utils/statusEngine";

/**
 * Saving a public intake submission as a DRAFT request: shared by the server-to-server endpoint (/api/intake/public) and the demo
 * deployment's own booking page (/book). Never books, never sends offers. SERVER ONLY.
 */

const SOURCE_CHANNEL = "public_intake_form";

/**
 * One transaction. With a submissionId, a retry of the same submission (a timeout, a double click) returns the first request instead
 * of creating a second; the advisory lock makes two retries at the same moment safe too.
 */
export async function insertPublicRequest(draft: PublicRequestDraft, submissionId: string | undefined): Promise<{ id: string; duplicate: boolean }> {
  return db.transaction(async (tx) => {
    if (submissionId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`public-intake:${submissionId}`}))`);
      const [existing] = await tx
        .select({ id: requests.id })
        .from(requests)
        .where(
          sql`${requests.data} #>> '{source,channel}' = ${SOURCE_CHANNEL} AND ${requests.data} #>> '{source,submissionId}' = ${submissionId}`,
        )
        .limit(1);
      if (existing) return { id: existing.id, duplicate: true };
    }
    const [row] = await tx
      .insert(requests)
      .values({
        title: draft.title,
        // 'draft' = awaiting agency review. Never a state job: the program is always General.
        status: "draft",
        isStateJob: false,
        // The app reads createdAt as the appointment start (same as the agency form).
        createdAt: new Date(draft.startsAt),
        data: draft.data,
      })
      .returning({ id: requests.id });
    return { id: row.id, duplicate: false };
  });
}

/** After a NEW draft is saved: the activity line, the admins' notification and fresh lists. `actorLabel` names the channel. */
export async function announcePublicRequest(id: string, draft: PublicRequestDraft, actorLabel: string): Promise<void> {
  await logActivity({ requestId: id, kind: "created", audience: "shared", message: "Request created", actorLabel });

  // Tell staff there is something to review. Reference, date and generic setting only: nothing about the client.
  const summary = summarizeJob({ id, title: draft.title, createdAt: new Date(draft.startsAt), data: draft.data });
  await notifyAgencyAdmins({
    type: "job",
    href: `/requests/${id}`,
    title: "New request from the public form",
    message: `${formatReference(id)} · ${summary.dateLabel} · ${summary.setting}. Review it before it goes live.`,
  });

  for (const path of ["/requests", "/dashboard", "/calendar"]) revalidatePath(path);
}
