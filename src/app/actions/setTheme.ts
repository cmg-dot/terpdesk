"use server";

import { z } from "zod";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { THEME_IDS } from "@/lib/theme";
import type { ThemeId } from "@/lib/theme";

const setThemeSchema = z.object({ theme: z.enum(THEME_IDS) });

export type SetThemeResult = { success: true; theme: ThemeId } | { success: false; error: string };

/**
 * Saves the workspace theme for the signed-in agency login. The target row always comes from the session, never from the
 * request. The caller then refreshes its session (`update()`), which re-reads the saved value into the sign-in token.
 */
export async function setTheme(input: z.input<typeof setThemeSchema>): Promise<SetThemeResult> {
  let userId: string;
  try {
    userId = (await requireRole("agency")).user.id;
  } catch {
    return { success: false, error: "You need to be signed in as agency staff to change the theme." };
  }

  const parsed = setThemeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That theme isn't available." };
  const { theme } = parsed.data;

  try {
    await db
      .insert(userPreferences)
      .values({ userId, theme })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { theme, updatedAt: new Date() } });
    return { success: true, theme };
  } catch {
    return { success: false, error: "The theme couldn't be saved. Try again in a moment." };
  }
}
