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
// The outer columns are written with their table name on purpose. In a single-table query Drizzle renders a column
// bare ("id"), and inside the subquery a bare "id" means the profile table's own id, so the match never succeeded
// and everyone fell back to the account name. A fully qualified "interpreters"."id" always means the outer row.
const OUTER_ID = sql.raw('"interpreters"."id"');
const OUTER_NAME = sql.raw('"interpreters"."name"');

export const interpreterDisplayName = sql<string>`coalesce(
  nullif(trim((
    select p.preferred_name from interpreter_profiles p
    where p.interpreter_id = ${OUTER_ID}::text
    order by p.updated_at desc
    limit 1
  )), ''),
  ${OUTER_NAME}
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
