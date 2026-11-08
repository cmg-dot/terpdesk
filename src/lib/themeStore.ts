import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { DEFAULT_THEME, toThemeId } from "@/lib/theme";
import type { ThemeId } from "@/lib/theme";

/**
 * The workspace theme saved for a login. No saved choice is the default theme. Returns undefined when the lookup fails (for
 * instance before 0006_user_preferences.sql is applied), so the sign-in token retries on a later request instead of caching
 * a guess.
 */
export async function readSavedTheme(userId: string): Promise<ThemeId | undefined> {
  try {
    const [row] = await db.select({ theme: userPreferences.theme }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return row ? toThemeId(row.theme) : DEFAULT_THEME;
  } catch {
    return undefined;
  }
}
