import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters, notifications, users } from "@/db/schema";
import type { NotificationType } from "@/db/schema";
import { logError } from "@/lib/logError";

/**
 * Notices an interpreter also sees on the dismissible banner at the top of Home and Jobs (lib/scheduleBanners.ts): a booking added
 * to their schedule by the agency, one taken off it by a cancellation, or the agency's answer to their question. Every other notice
 * is bell-only (kind NULL).
 */
export const SCHEDULE_BANNER_KINDS = ["booking_added", "booking_cancelled", "question_answered"] as const;
export type ScheduleBannerKind = (typeof SCHEDULE_BANNER_KINDS)[number];

/**
 * Notices agency staff also see on the persistent banner at the top of their workspace (components/agency/AgencyBanners.tsx): an
 * interpreter accepted an offer, or asked a question. Each staff member closes their own.
 */
export const AGENCY_BANNER_KINDS = ["offer_accepted", "offer_question"] as const;
export type AgencyBannerKind = (typeof AGENCY_BANNER_KINDS)[number];

export interface NotificationInput {
  title: string;
  /** No PHI: never put client names, appointment details or notes here. */
  message: string;
  type: NotificationType;
  href?: string;
  kind?: ScheduleBannerKind | AgencyBannerKind;
}

/**
 * Notification helpers for server actions. They never throw: a failed notification must not undo or block the
 * action that triggered it.
 *
 * SERVER ONLY: queries the database.
 */
export async function notifyUser(userId: string, input: NotificationInput): Promise<void> {
  try {
    await db.insert(notifications).values({ userId, ...input, href: input.href ?? null });
  } catch (err) {
    logError("notifyUser", err);
  }
}

/** Notifies the login that owns an interpreter profile. Shadow profiles have no login, so they are skipped. */
export async function notifyInterpreter(interpreterId: string, input: NotificationInput): Promise<void> {
  try {
    const [row] = await db
      .select({ userId: interpreters.userId })
      .from(interpreters)
      .where(eq(interpreters.id, interpreterId))
      .limit(1);
    if (row?.userId) await notifyUser(row.userId, input);
  } catch (err) {
    logError("notifyInterpreter", err);
  }
}

/** Notifies every agency staff login. The workspace has a single agency, so all agency users are its admins. */
export async function notifyAgencyAdmins(input: NotificationInput): Promise<void> {
  try {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "agency"));
    if (admins.length === 0) return;
    await db.insert(notifications).values(admins.map((a) => ({ userId: a.id, ...input, href: input.href ?? null })));
  } catch (err) {
    logError("notifyAgencyAdmins", err);
  }
}
