"use client";

import { ThemeCard } from "@/components/settings/ThemeCard";
import { useThemeChoice } from "@/hooks/useThemeChoice";
import { THEME_OPTIONS } from "@/lib/theme";

/** Settings → Appearance: pick the workspace theme. The choice is saved to the login, so it follows the user across reloads and devices. */
export const ThemePicker = () => {
  const { selected, saving, error, choose } = useThemeChoice();

  return (
    <div>
      <div role="radiogroup" aria-label="Workspace theme" className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {THEME_OPTIONS.map((option) => (
          <ThemeCard key={option.id} option={option} selected={selected === option.id} disabled={saving} onChoose={() => void choose(option.id)} />
        ))}
      </div>
      <p role="status" aria-live="polite" className={`mt-5 min-h-[20px] text-[13px] ${error ? "text-red-600" : "text-[var(--sage)]"}`}>
        {error ?? (saving ? "Saving…" : "Your theme is saved to your account.")}
      </p>
    </div>
  );
};
