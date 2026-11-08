"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { setTheme } from "@/app/actions/setTheme";
import { DEFAULT_THEME } from "@/lib/theme";
import type { ThemeId } from "@/lib/theme";

/** Paints a theme right away (the same attribute the root layout sets), so the click is felt before the save returns. */
const paint = (theme: ThemeId) => {
  document.documentElement.dataset.theme = theme;
};

/**
 * The workspace theme picker's state: the saved choice (from the session), choosing a new one, and the save in between.
 * Choosing paints immediately, saves through the setTheme action, then refreshes the session so the saved value is what
 * every page load starts from. If the save fails the previous theme is painted back and the reason is returned.
 */
export function useThemeChoice() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const saved = session?.user?.theme ?? DEFAULT_THEME;
  const [choosing, setChoosing] = useState<ThemeId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (next: ThemeId) => {
      const current = choosing ?? saved;
      if (next === current) return;
      setError(null);
      setChoosing(next);
      paint(next);
      try {
        const result = await setTheme({ theme: next });
        if (!result.success) {
          paint(current);
          setError(result.error);
          return;
        }
        await update();
        router.refresh();
      } catch {
        paint(current);
        setError("The theme couldn't be saved. Try again in a moment.");
      } finally {
        setChoosing(null);
      }
    },
    [choosing, saved, update, router],
  );

  return { selected: choosing ?? saved, saving: choosing !== null, error, choose };
}
