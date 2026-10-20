import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { interpreters } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";

/**
 * The name agencies see for an interpreter: their profile's preferred name, or the account name when that is empty.
 * A correlated subquery (newest profile row wins) instead of a join, so interpreters with more than one profile row
 * are never duplicated. Usable in any query that has the `interpreters` table in scope (select or orderBy).
 *
 * Call `ensureDisplayNameColumns()` before running a query that uses it: it adds `preferred_name` on databases
 * that have not been migrated yet.
 *
 * SERVER ONLY.
 */
export const interpreterDisplayName = sql<string>`coalesce(
  nullif(trim((
    select p.preferred_name from interpreter_profiles p
    where p.interpreter_id = ${interpreters.id}::text
    order by p.updated_at desc
    limit 1
  )), ''),
  ${interpreters.name}
)`;

export const ensureDisplayNameColumns = ensureAvailabilityTables;

/** One interpreter's display name (for notifications and emails). Null when the interpreter does not exist. */
export async function getInterpreterDisplayName(interpreterId: string): Promise<string | null> {
  await ensureDisplayNameColumns();
  const [row] = await db
    .select({ name: interpreterDisplayName })
    .from(interpreters)
    .where(eq(interpreters.id, interpreterId))
    .limit(1);
  return row?.name ?? null;
}
