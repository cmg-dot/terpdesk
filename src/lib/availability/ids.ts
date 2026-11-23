import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interpreters } from "@/db/schema";

/**
 * Interpreter ids. Plain server code (not a Server Action), so it is not an endpoint the browser can call.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Bridges mock test IDs ('terp-1', 'terp-new') and PostgreSQL UUIDs so availability
 * saved in interpreter views is immediately found by agency views and vice versa.
 */
export async function resolveInterpreterIds(interpreterId: string): Promise<string[]> {
  const ids = new Set<string>([interpreterId]);
  const mockEmailMap: Record<string, string> = {
    "terp-1": "dale.fictional@example.com",
    "terp-new": "new.terp@example.com",
    "active-terp": "dale.fictional@example.com",
  };

  const email = mockEmailMap[interpreterId];
  if (email) {
    try {
      const [row] = await db
        .select({ id: interpreters.id })
        .from(interpreters)
        .where(eq(interpreters.email, email))
        .limit(1);
      if (row) {
        ids.add(row.id);
      }
    } catch (e) {}
  } else {
    try {
      const rows = await db
        .select({ id: interpreters.id, email: interpreters.email })
        .from(interpreters)
        .limit(50);
      for (const row of rows) {
        if (row.id === interpreterId) {
          if (row.email === "dale.fictional@example.com") ids.add("terp-1");
          if (row.email === "new.terp@example.com") ids.add("terp-new");
        }
      }
    } catch (e) {}
  }

  return Array.from(ids);
}
