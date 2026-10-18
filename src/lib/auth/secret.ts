/**
 * Shared by the NextAuth route (Node) and the middleware (Edge), so it must stay dependency-free.
 *
 * Set NEXTAUTH_SECRET in every real environment. The fallback exists only so local development
 * works out of the box; in production a missing secret yields `undefined`, which makes every
 * token check fail closed (nobody is treated as signed in).
 */
export const getAuthSecret = (): string | undefined =>
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== "production" ? "terpdesk-local-dev-secret-do-not-use-in-production" : undefined);
