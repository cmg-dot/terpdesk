/**
 * HIPAA log scrubbing for everything the Node.js server prints, including errors Next.js logs on its own (an uncaught
 * error in a server action or route handler is printed by Next, not by our code).
 *
 * What it removes:
 *  - Drizzle's "params: ..." (DrizzleQueryError puts every bound value of the failed query in its message and in a
 *    `params` property: for a request update that is the whole request, notes included);
 *  - Postgres' `detail` / `where` text and quoted values in driver messages ("Key (email)=(...)", `syntax for type
 *    uuid: "..."`), which echo row data;
 *  - any `query`/`parameters` properties on driver errors.
 * The SQL text, error names, codes and stack frames stay, so failures can still be located.
 *
 * SERVER ONLY. Installed once from src/instrumentation.ts.
 */

const PARAMS_BLOCK = /\nparams:[\s\S]*?(?=\n\s+at\s|$)/g;
const QUOTED_VALUE_AFTER_COLON = /(:\s*)"[^"\n]*"/g;
const KEY_VALUE_DETAIL = /\(([^()\n]*)\)=\([^()\n]*\)/g;
const MAX_DEPTH = 3;

/** Cuts Drizzle's bound parameters out of a message or stack (they can span several lines). */
export const stripQueryParams = (text: string): string => text.replace(PARAMS_BLOCK, "\nparams: [redacted]");

/** Removes values a database driver echoes back ("...: \"value\"", "Key (col)=(value)"); keeps table/column names. */
export const redactQuotedValues = (text: string): string =>
  text.replace(QUOTED_VALUE_AFTER_COLON, '$1"[redacted]"').replace(KEY_VALUE_DETAIL, "($1)=([redacted])");

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  code?: unknown;
  digest?: unknown;
  cause?: unknown;
}

/** A copy of an error with only safe fields; the original is never modified. */
function scrubError(err: Error, depth: number): Error {
  const source = err as Error & ErrorLike;
  const safe = new Error(redactQuotedValues(stripQueryParams(String(source.message ?? ""))));
  // Subclasses that never set `name` (e.g. DrizzleQueryError) keep their class name, which is useful when debugging.
  const className = err.constructor?.name;
  safe.name = typeof source.name === "string" && source.name !== "Error" ? source.name : className || "Error";
  safe.stack = typeof source.stack === "string" ? redactQuotedValues(stripQueryParams(source.stack)) : undefined;
  const extra = safe as Error & { code?: string; digest?: string; cause?: unknown };
  if (typeof source.code === "string") extra.code = source.code;
  if (typeof source.digest === "string") extra.digest = source.digest; // links a browser error to this log line
  if (source.cause !== undefined && depth < MAX_DEPTH) extra.cause = scrubLogValue(source.cause, depth + 1);
  return safe;
}

export function scrubLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactQuotedValues(stripQueryParams(value));
  if (value instanceof Error) return scrubError(value, depth);
  if (value && typeof value === "object" && "message" in value && "code" in value && depth > 0) {
    // A non-Error driver error object (some drivers throw plain objects): keep only its code.
    const code = (value as ErrorLike).code;
    return { code: typeof code === "string" ? code : "unknown" };
  }
  return value;
}

const METHODS = ["log", "info", "warn", "error", "debug"] as const;
const INSTALLED = Symbol.for("terpdesk.consoleScrubber");

/** Wraps console.log/info/warn/error/debug so every argument is scrubbed first. Safe to call more than once. */
export function installConsoleScrubber(): void {
  const registry = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (registry[INSTALLED]) return;
  registry[INSTALLED] = true;
  const target = console as unknown as Record<(typeof METHODS)[number], (...args: unknown[]) => void>;
  for (const method of METHODS) {
    const original = target[method].bind(console);
    target[method] = (...args: unknown[]) => original(...args.map((arg) => scrubLogValue(arg)));
  }
}
