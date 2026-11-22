import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, offers } from "@/db/schema";
import { toastKindsFor } from "@/lib/bannerKinds";
import type { AlertAudience } from "@/lib/bannerKinds";
import type { AlertToast, Pulse } from "@/lib/pulse";

/**
 * The database reads behind the pulse (actions/pulse.ts decides WHO is asking from the session, then calls these). Read-only, scoped to
 * the one signed-in user's own notifications and offers. SERVER ONLY.
 */

export interface PulseViewer {
  userId: string;
  audience: AlertAudience;
  /** An interpreter's own profile id (their offers); null for staff. */
  interpreterId: string | null;
}

/** Staff watch the questions waiting for an answer; an interpreter, the answers they have not closed. */
const QUESTION_KIND = { agency: "offer_question", interpreter: "question_answered" } as const;

export async function readPulse(me: PulseViewer, now: Date = new Date()): Promise<Pulse> {
  const mine = eq(notifications.userId, me.userId);
  // Staff watch the offers waiting for any interpreter; an interpreter watches their own.
  const waiting = and(eq(offers.status, "pending"), gt(offers.expiresAt, now), me.interpreterId ? eq(offers.interpreterId, me.interpreterId) : undefined);
  const [latest, unread, openOffers, openQuestions] = await Promise.all([
    db.select({ id: notifications.id, createdAt: notifications.createdAt }).from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(1),
    db.select({ n: count() }).from(notifications).where(and(mine, eq(notifications.isRead, false))),
    db.select({ n: count() }).from(offers).where(waiting),
    db.select({ n: count() }).from(notifications).where(and(mine, eq(notifications.kind, QUESTION_KIND[me.audience]), isNull(notifications.bannerDismissedAt))),
  ]);
  return {
    latestId: latest[0]?.id ?? null,
    latestAt: latest[0]?.createdAt.toISOString() ?? null,
    unread: Number(unread[0]?.n ?? 0),
    openOffers: Number(openOffers[0]?.n ?? 0),
    openQuestions: Number(openQuestions[0]?.n ?? 0),
    serverNow: now.toISOString(),
  };
}

const MAX_NEW = 5;

/** The high-signal notices (the ones that are also top banners) that arrived after `after`, oldest first. */
export async function readNewAlerts(me: PulseViewer, after: Date): Promise<AlertToast[]> {
  const rows = await db
    .select({ id: notifications.id, kind: notifications.kind, title: notifications.title, message: notifications.message, href: notifications.href, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.userId, me.userId), inArray(notifications.kind, [...toastKindsFor(me.audience)]), gt(notifications.createdAt, after)))
    .orderBy(desc(notifications.createdAt))
    .limit(MAX_NEW);
  return rows.reverse().map((r) => ({ id: r.id, kind: r.kind ?? "", title: r.title, message: r.message, href: r.href, createdAt: r.createdAt.toISOString() }));
}
