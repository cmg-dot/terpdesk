"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { NotificationType } from "@/db/schema";
import { requireSession } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";

export interface MyNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  href: string | null;
  isRead: boolean;
  createdAt: string;
}

const idSchema = z.string().uuid();
const LIMIT = 30;

/** The signed-in user's latest notifications (newest first). Always scoped to the session user. */
export async function getMyNotifications(): Promise<MyNotification[]> {
  const session = await requireSession();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(LIMIT);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    type: r.type,
    href: r.href,
    isRead: r.isRead,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Marks one of the signed-in user's notifications as read. Someone else's id matches nothing. */
export async function markNotificationRead(idInput: string): Promise<boolean> {
  const session = await requireSession();
  const parsed = idSchema.safeParse(idInput);
  if (!parsed.success) return false;
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, parsed.data), eq(notifications.userId, session.user.id)));
    return true;
  } catch (err) {
    logError("markNotificationRead", err);
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const session = await requireSession();
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, session.user.id), eq(notifications.isRead, false)));
    return true;
  } catch (err) {
    logError("markAllNotificationsRead", err);
    return false;
  }
}
