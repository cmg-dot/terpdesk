"use server";

import { and, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { SCHEDULE_BANNER_KINDS } from "@/lib/notifications";
import type { ScheduleBannerKind } from "@/lib/notifications";

export interface ScheduleBanner {
  id: string;
  kind: ScheduleBannerKind;
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
}

/** How long an undismissed schedule change stays on the banner (the bell keeps it for good). */
const BANNER_DAYS = 14;
const MAX_SHOWN = 5;

const isBannerKind = (kind: string | null): kind is ScheduleBannerKind => (SCHEDULE_BANNER_KINDS as readonly string[]).includes(kind ?? "");

/**
 * The signed-in interpreter's recent schedule changes for the top banner: a booking the agency added, or one taken off by a
 * cancellation, from the last two weeks and not yet closed. Only their own notices; empty for anyone else or on error.
 */
export async function getMyScheduleBanners(): Promise<ScheduleBanner[]> {
  let userId: string;
  try {
    ({ session: { user: { id: userId } } } = await requireInterpreter());
  } catch {
    return [];
  }
  try {
    const rows = await db
      .select({ id: notifications.id, kind: notifications.kind, title: notifications.title, message: notifications.message, href: notifications.href, createdAt: notifications.createdAt })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        inArray(notifications.kind, [...SCHEDULE_BANNER_KINDS]),
        isNull(notifications.bannerDismissedAt),
        gt(notifications.createdAt, new Date(Date.now() - BANNER_DAYS * 86_400_000)),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(MAX_SHOWN);
    return rows.flatMap((r) => (isBannerKind(r.kind) ? [{ id: r.id, kind: r.kind, title: r.title, message: r.message, href: r.href, createdAt: r.createdAt.toISOString() }] : []));
  } catch (err) {
    logError("getMyScheduleBanners", err);
    return [];
  }
}

/** Closes one notice on the banner (and marks it read). Only the caller's own schedule notices can be closed. */
export async function dismissScheduleBanner(idInput: string): Promise<{ success: boolean }> {
  let userId: string;
  try {
    ({ session: { user: { id: userId } } } = await requireInterpreter());
  } catch {
    return { success: false };
  }
  const parsed = z.string().uuid().safeParse(idInput);
  if (!parsed.success) return { success: false };
  try {
    await db
      .update(notifications)
      .set({ bannerDismissedAt: new Date(), isRead: true })
      .where(and(eq(notifications.id, parsed.data), eq(notifications.userId, userId), isNotNull(notifications.kind)));
    return { success: true };
  } catch (err) {
    logError("dismissScheduleBanner", err);
    return { success: false };
  }
}
