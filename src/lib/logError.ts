/**
 * Logs the real failure (message, stack, and the underlying database error) so a crash can be located.
 * Drizzle puts the bound query parameters in its error message ("Failed query: ... params: ..."), and for
 * sign-ups those are emails and password hashes, so that part is cut off before logging.
 * HIPAA: Postgres' `detail` ("Key (email)=(...) already exists") quotes row values, so it is never printed either;
 * the error code identifies the failure without exposing data.
 */
const stripParams = (message: string): string => message.split(/\nparams:/i)[0];

interface DbLikeError {
  code?: string;
  message?: string;
  detail?: string;
  cause?: unknown;
}

export function logError(tag: string, err: unknown): void {
  if (!(err instanceof Error)) {
    console.error(`[${tag}] non-Error thrown:`, typeof err);
    return;
  }

  console.error(`[${tag}] ${err.name}: ${stripParams(err.message)}`);
  if (err.stack) console.error(stripParams(err.stack));

  // Drizzle wraps the driver error; the Postgres code ("42P01" = table missing, "23505" = duplicate, ...) is on `cause`.
  const cause = (err as DbLikeError).cause as DbLikeError | undefined;
  if (cause) {
    console.error(
      `[${tag}] caused by: code=${cause.code ?? "n/a"} message=${stripParams(cause.message ?? "n/a")}`,
    );
  }
}
