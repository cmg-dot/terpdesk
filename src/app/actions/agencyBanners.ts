"use server";

import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { AGENCY_BANNER_KINDS } from "@/lib/notifications";
import type { AgencyBannerKind } from "@/lib/notifications";

export interface AgencyBanner {
  id: string;
  kind: AgencyBannerKind;
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
}

/** The banner shows this many; the rest wait in the bell ("+N more"). */
const MAX_SHOWN = 3;
/** An undismissed notice older than this leaves the banner (the bell keeps it for good). */
const BANNER_DAYS = 14;

const isAgencyKind = (kind: string | null): kind is AgencyBannerKind => (AGENCY_BANNER_KINDS as readonly string[]).includes(kind ?? "");

/**
 * The signed-in staff member's own open banner notices (an offer accepted, a question from an interpreter), newest first, and how
 * many there are in all. Each staff member has their own copy of every notice, so closing one never hides it from a colleague.
 * Agency staff only; empty for anyone else or on error.
 */
export async function getMyAgencyBanners(): Promise<{ items: AgencyBanner[]; total: number }> {
  let userId: string;
  try {
    userId = (await requireRole("agency")).user.id;
  } catch {
    return { items: [], total: 0 };
  }
  try {
    const open = and(
      eq(notifications.userId, userId),
      inArray(notifications.kind, [...AGENCY_BANNER_KINDS]),
      isNull(notifications.bannerDismissedAt),
      gt(notifications.createdAt, new Date(Date.now() - BANNER_DAYS * 86_400_000)),
    );
    const rows = await db
      .select({ id: notifications.id, kind: notifications.kind, title: notifications.title, message: notifications.message, href: notifications.href, createdAt: notifications.createdAt })
      .from(notifications)
      .where(open)
      .orderBy(desc(notifications.createdAt))
      .limit(MAX_SHOWN);
    const [{ total }] = await db.select({ total: count() }).from(notifications).where(open);
    const items = rows.flatMap((r) => (isAgencyKind(r.kind) ? [{ id: r.id, kind: r.kind, title: r.title, message: r.message, href: r.href, createdAt: r.createdAt.toISOString() }] : []));
    return { items, total: Number(total) };
  } catch (err) {
    logError("getMyAgencyBanners", err);
    return { items: [], total: 0 };
  }
}

/** Closes one notice on the caller's own banner (and marks it read in their bell). Never anyone else's. */
export async function dismissAgencyBanner(idInput: string): Promise<{ success: boolean }> {
  let userId: string;
  try {
    userId = (await requireRole("agency")).user.id;
  } catch {
    return { success: false };
  }
  const parsed = z.string().uuid().safeParse(idInput);
  if (!parsed.success) return { success: false };
  try {
    await db
      .update(notifications)
      .set({ bannerDismissedAt: new Date(), isRead: true })
      .where(and(eq(notifications.id, parsed.data), eq(notifications.userId, userId), inArray(notifications.kind, [...AGENCY_BANNER_KINDS])));
    return { success: true };
  } catch (err) {
    logError("dismissAgencyBanner", err);
    return { success: false };
  }
}
