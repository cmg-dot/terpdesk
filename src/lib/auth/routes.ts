/**
 * Which role each protected area belongs to. Pure and Edge-safe (used by the middleware and the login form).
 * Route groups like (dashboard) do not appear in URLs, so the real path prefixes are listed here.
 * Keep `config.matcher` in src/middleware.ts in sync with these lists.
 */
export type AppRole = "agency" | "interpreter";

export const AGENCY_PREFIXES = [
  "/dashboard",
  "/requests",
  "/calendar",
  "/clients",
  "/interpreters",
  "/billing",
  "/settings",
  "/hours-review",
  "/website-requests",
] as const;

export const INTERPRETER_PREFIXES = [
  "/jobs",
  "/interpreter-home",
  "/interpreter-calendar",
  "/interpreter-settings",
  "/agencies",
  "/profile",
  "/prep",
] as const;

const matchesPrefix = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** The role required for a path, or null when the path is public. */
export const requiredRoleForPath = (path: string): AppRole | null => {
  if (AGENCY_PREFIXES.some((p) => matchesPrefix(path, p))) return "agency";
  if (INTERPRETER_PREFIXES.some((p) => matchesPrefix(path, p))) return "interpreter";
  return null;
};

export const homePathForRole = (role: AppRole): string => (role === "agency" ? "/dashboard" : "/interpreter-home");

export const isAppRole = (value: unknown): value is AppRole => value === "agency" || value === "interpreter";
