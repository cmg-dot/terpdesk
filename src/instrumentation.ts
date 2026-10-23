/**
 * Runs once when a Next.js server instance starts. Installs the HIPAA log scrubber on the Node.js runtime so nothing
 * printed by the app or by Next itself (e.g. an uncaught database error) carries query parameters or row values.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installConsoleScrubber } = await import("@/lib/logScrub");
  installConsoleScrubber();
}
