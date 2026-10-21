import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters } from "@/db/schema";
import { ensureAvailabilityTables } from "@/app/actions/availability";
import { interpreterDisplayName } from "@/lib/displayNameSql";

/**
 * The name agencies see for an interpreter: their profile's preferred name, or the account name when that is empty.
 * The SQL lives in displayNameSql.ts (see there for why the columns are fully qualified).
 *
 * Call `ensureDisplayNameColumns()` before running a query that uses it: it adds `preferred_name` on databases
 * that have not been migrated yet.
 *
 * SERVER ONLY.
 */
export { interpreterDisplayName };

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
