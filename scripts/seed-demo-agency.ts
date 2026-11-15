import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Sql } from "postgres";
import * as schema from "@/db/schema";
import { databaseSslOptions } from "@/db/ssl";
import { onsiteKeyPrefix } from "@/lib/onsiteSignoff";
import { removeObjectsQuietly, uploadObject } from "@/lib/s3";
import { DEMO_CLIENTS, clientData, demoInterpreters } from "./demo/fixtures";
import type { ClientKey } from "./demo/fixtures";
import { assertConnectedToDemo, demoTargetFromEnv } from "./demo/guard";
import { demoJobs } from "./demo/jobs";
import { buildPeopleRows } from "./demo/people";
import { buildJobRows } from "./demo/rows";

/**
 * Wipes and re-seeds the DEMO database (terpdesk_demo) with a fictional agency: logins, roster, clients and 18 jobs anchored to now.
 * Re-run it any time (the morning of a demo) for a fresh, correctly dated sandbox.
 *
 *   DEMO_CONFIRM=yes DEMO_DATABASE_URL="postgresql://.../terpdesk_demo" npm run seed:demo
 *
 * Safety: see demo/guard.ts. DATABASE_URL (production) is read only to make sure it is NOT the target; nothing here imports the
 * app's database module. The on-site signature pictures go to the bucket in DEMO_S3_BUCKET_NAME (else AWS_S3_BUCKET_NAME), only
 * under onsite-signatures/<demo request id>/; a re-run removes the previous run's pictures, found through the demo rows only.
 *
 * Optional: DEMO_PASSWORD (all three logins), DEMO_AGENCY_EMAIL, DEMO_TERP1_EMAIL, DEMO_TERP2_EMAIL, DEMO_DATABASE_NAME.
 */

const DEFAULTS = {
  password: "DemoTerp2026!",
  agencyEmail: "demo@myterpdesk.com",
  terp1: "ralphsilva0405+terp1@gmail.com",
  terp2: "ralphsilva0405+terp2@gmail.com",
} as const;

const env = (key: string, fallback: string): string => process.env[key]?.trim() || fallback;

/** The on-site pictures the current demo rows point at, each checked to sit in its own request's folder. */
async function previousSignoffKeys(client: Sql): Promise<string[]> {
  const rows = await client<{ id: string; hours: Record<string, { onsiteSignoff?: { storageKey?: unknown } }> | null }[]>`
    select id, data -> 'hoursSubmissions' as hours from requests where data ? 'hoursSubmissions'`;
  return rows.flatMap((row) =>
    Object.values(row.hours ?? {})
      .map((h) => h?.onsiteSignoff?.storageKey)
      .filter((key): key is string => typeof key === "string" && key.startsWith(onsiteKeyPrefix(row.id))),
  );
}

async function main(): Promise<void> {
  config({ quiet: true });
  const target = demoTargetFromEnv(process.env);
  const password = env("DEMO_PASSWORD", DEFAULTS.password);
  if (password.length < 10) throw new Error("DEMO_PASSWORD must be at least 10 characters.");
  const bucketOverride = process.env.DEMO_S3_BUCKET_NAME?.trim();
  if (bucketOverride) process.env.AWS_S3_BUCKET_NAME = bucketOverride;
  console.log(`Target: database "${target.database}" on ${target.host}; signatures to bucket "${process.env.AWS_S3_BUCKET_NAME ?? "(not set)"}"`);

  const client = postgres(target.url, { prepare: false, ssl: databaseSslOptions(), max: 1 });
  try {
    await assertConnectedToDemo(client, target);
    const db = drizzle(client, { schema });
    const now = new Date();

    const passwordHash = await bcrypt.hash(password, 12);
    const people = buildPeopleRows({
      interpreters: demoInterpreters({ terp1Email: env("DEMO_TERP1_EMAIL", DEFAULTS.terp1).toLowerCase(), terp2Email: env("DEMO_TERP2_EMAIL", DEFAULTS.terp2).toLowerCase() }),
      admin: { email: env("DEMO_AGENCY_EMAIL", DEFAULTS.agencyEmail).toLowerCase(), name: "Evergreen Demo Admin" },
      passwordHash,
      now,
    });
    const clients = new Map(DEMO_CLIENTS.map((c) => [c.key, c]));
    const jobs = buildJobRows(demoJobs(now), {
      interpreter: (key) => {
        const found = people.byKey.get(key);
        if (!found) throw new Error(`Unknown demo interpreter ${key}`);
        return found;
      },
      client: (key: ClientKey) => {
        const found = clients.get(key);
        if (!found) throw new Error(`Unknown demo client ${key}`);
        return found;
      },
      adminName: "Evergreen Demo Admin",
    }, now);

    const oldKeys = await previousSignoffKeys(client);
    const uploaded: string[] = [];
    try {
      for (const file of jobs.uploads) {
        await uploadObject(file.key, file.bytes, "image/png");
        uploaded.push(file.key);
      }
      await db.transaction(async (tx) => {
        // Checked again on the transaction's own connection, right before the wipe.
        const [here] = await tx.execute<{ db: string }>(sql`select current_database() as db`);
        if (here?.db !== target.database) throw new Error(`Refusing to wipe: connected to "${here?.db}".`);
        const tables = await tx.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`);
        const list = tables.map((t) => `public."${t.tablename.replace(/"/g, '""')}"`).join(", ");
        if (list) await tx.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));

        await tx.insert(schema.users).values(people.users);
        await tx.insert(schema.interpreters).values(people.interpreters);
        await tx.insert(schema.agencyInterpreters).values(people.roster);
        await tx.insert(schema.interpreterProfiles).values(people.profiles);
        await tx.insert(schema.availabilityShares).values(people.shares);
        await tx.insert(schema.availabilityRules).values(people.rules);
        await tx.insert(schema.notifications).values(people.notifications);
        await tx.insert(schema.clients).values(DEMO_CLIENTS.map((c) => ({ id: `demo-${c.key}`, name: c.name, type: c.type, data: clientData(c) })));
        await tx.insert(schema.requests).values(jobs.requests);
        await tx.insert(schema.offers).values(jobs.offers);
        await tx.insert(schema.requestActivity).values(jobs.activity);
        if (jobs.legs.length > 0) await tx.insert(schema.mileageLegs).values(jobs.legs);
      });
    } catch (err) {
      // Nothing was saved: the pictures this run uploaded are removed again.
      await removeObjectsQuietly(uploaded);
      throw err;
    }
    await removeObjectsQuietly(oldKeys);

    const counts = await client<{ table: string; rows: number }[]>`
      select 'users' as table, count(*)::int as rows from users union all select 'interpreters', count(*)::int from interpreters
      union all select 'agency_interpreters', count(*)::int from agency_interpreters union all select 'clients', count(*)::int from clients
      union all select 'requests', count(*)::int from requests union all select 'offers', count(*)::int from offers
      union all select 'timesheets', count(*)::int from timesheets union all select 'mileage_legs', count(*)::int from mileage_legs
      union all select 'request_activity', count(*)::int from request_activity`;
    console.log(`Seeded "${target.database}": ${counts.map((c) => `${c.table}=${c.rows}`).join(", ")}`);
    console.log(`Uploaded ${uploaded.length} on-site signature picture(s); removed ${oldKeys.length} from the previous run.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  // Never print a connection string: it holds the database password.
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Demo seed failed: ${message.replace(/postgres(ql)?:\/\/\S+/g, "<url>")}`);
  process.exitCode = 1;
});
