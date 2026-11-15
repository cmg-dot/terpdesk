import type { Sql } from "postgres";

/**
 * The demo seed's safety lock. It decides which database the seed may touch BEFORE any connection is opened, and confirms it
 * again once connected. Production shares the RDS instance (same host), so the database NAME is what tells them apart.
 *
 *  - DEMO_CONFIRM must be exactly "yes".
 *  - DEMO_DATABASE_URL must be set. DATABASE_URL is never used to connect, not even as a fallback.
 *  - The database named in DEMO_DATABASE_URL must be DEMO_DATABASE_NAME (default "terpdesk_demo") and contain "demo".
 *  - It must not be the database DATABASE_URL names (same host, port and database name).
 *  - Once connected, current_database() must return that same name.
 */

export interface DemoTarget {
  url: string;
  database: string;
  host: string;
}

const clean = (value: string | undefined): string => (value ?? "").trim().replace(/^["']|["']$/g, "").trim();

function parse(raw: string, label: string): URL {
  try {
    return new URL(raw);
  } catch {
    // Never echo the value: it holds the database password.
    throw new Error(`${label} is not a valid postgres connection string.`);
  }
}

const databaseOf = (url: URL): string => decodeURIComponent(url.pathname.replace(/^\//, ""));
const portOf = (url: URL): string => url.port || "5432";

export function demoTargetFromEnv(env: NodeJS.ProcessEnv): DemoTarget {
  if (env.DEMO_CONFIRM !== "yes") throw new Error('Refusing to run: set DEMO_CONFIRM=yes to confirm the demo database may be wiped.');
  const raw = clean(env.DEMO_DATABASE_URL);
  if (!raw) throw new Error("Refusing to run: DEMO_DATABASE_URL is not set (DATABASE_URL is never used by this script).");

  const demo = parse(raw, "DEMO_DATABASE_URL");
  const expected = clean(env.DEMO_DATABASE_NAME) || "terpdesk_demo";
  const database = databaseOf(demo);
  if (database !== expected) throw new Error(`Refusing to run: DEMO_DATABASE_URL names database "${database}", expected "${expected}".`);
  if (!database.toLowerCase().includes("demo")) throw new Error(`Refusing to run: "${database}" does not look like a demo database.`);

  const prodRaw = clean(env.DATABASE_URL);
  if (prodRaw) {
    const prod = parse(prodRaw, "DATABASE_URL");
    const same = prod.hostname.toLowerCase() === demo.hostname.toLowerCase() && portOf(prod) === portOf(demo) && databaseOf(prod) === database;
    if (same) throw new Error("Refusing to run: DEMO_DATABASE_URL points at the same database as DATABASE_URL (production).");
  }
  return { url: raw, database, host: demo.hostname };
}

/** Run straight after connecting, before any other query: the server itself confirms which database this is. */
export async function assertConnectedToDemo(sql: Sql, target: DemoTarget): Promise<void> {
  const [row] = await sql<{ db: string }[]>`select current_database() as db`;
  if (row?.db !== target.database) throw new Error(`Refusing to run: connected to "${row?.db}", expected "${target.database}".`);
}
