/**
 * The workspace themes an agency login can pick in Settings → Appearance. Pure and shared: the picker, the Settings action,
 * the sign-in token and the root layout all read the same list. The colours themselves live in globals.css, keyed by
 * `<html data-theme="...">`; "default" has no attribute value of its own (it is the :root palette).
 */

export const THEME_IDS = ["asl_professionals", "default", "ocean", "dark"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "default";

export const isThemeId = (value: unknown): value is ThemeId => typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);

/** A stored or untrusted value, narrowed to a theme (anything unknown is the default). */
export const toThemeId = (value: unknown): ThemeId => (isThemeId(value) ? value : DEFAULT_THEME);

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Preview swatch: the sidebar colour, then the page colour (the same pair the card shows). */
  sidebar: string;
  page: string;
  /** Optional accent stripe on the swatch. */
  accent?: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: "asl_professionals", label: "ASL Professionals", sidebar: "#4A2E4B", page: "#F9F6F0", accent: "#D4AF37" },
  { id: "default", label: "Agency Default", sidebar: "#0B3B32", page: "#F9F8F4" },
  { id: "ocean", label: "Ocean Blue", sidebar: "#1E3A8A", page: "#F8FAFC" },
  { id: "dark", label: "Dark Mode", sidebar: "#1F2937", page: "#111827" },
];

/** Only agency staff get a themed workspace; interpreters (external) always see the neutral default. */
export const themeForRole = (role: string | undefined, theme: ThemeId | undefined): ThemeId => (role === "agency" ? theme ?? DEFAULT_THEME : DEFAULT_THEME);
