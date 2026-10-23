import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { databaseSslOptions } from './ssl';

const LOCAL_FALLBACK = 'postgres://localhost:5432/terpdesk';

/**
 * The postgres driver parses the connection string with `new URL(...)` the moment it is imported, so a bad
 * DATABASE_URL (a pasted `DATABASE_URL=` prefix, surrounding quotes, an unfilled [YOUR-PASSWORD] placeholder, ...)
 * crashes every route that touches the database, including `next build`'s "Collecting page data" step, with a
 * bare "TypeError: Invalid URL". This cleans up the common paste mistakes and explains anything left.
 */
function resolveConnectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || !raw.trim()) return LOCAL_FALLBACK;

  const candidate = raw
    .trim()
    .replace(/^DATABASE_URL\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  try {
    new URL(candidate);
    return candidate;
  } catch {
    // The build only imports modules; it never connects, so a placeholder is safe there.
    if (process.env.NEXT_PHASE === 'phase-production-build') return LOCAL_FALLBACK;
    // Deliberately does not print the value: it contains the database password.
    throw new Error(
      'DATABASE_URL is set but is not a valid connection string. Expected something like ' +
        'postgresql://USER:PASSWORD@HOST:5432/DATABASE (special characters in the password must be URL-encoded).',
    );
  }
}

// Disable prefetch as it is not supported for "Transaction" pool mode.
// TLS is enforced with full certificate verification (see ./ssl.ts); it overrides any sslmode in the URL.
const client = postgres(resolveConnectionString(), { prepare: false, ssl: databaseSslOptions() });
export const db = drizzle(client, { schema });
