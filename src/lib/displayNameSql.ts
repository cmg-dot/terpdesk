import { sql } from "drizzle-orm";

/**
 * SQL fragments for an interpreter's profile fields, usable in any query that has the `interpreters` table in
 * scope. Kept free of other imports so the auth layer can use them without a circular import.
 *
 * The outer columns are written with their table name on purpose. In a single-table query Drizzle renders a column
 * bare ("id"), and inside a subquery a bare "id" means the subquery's own table, so the match would never succeed.
 * A fully qualified "interpreters"."id" always means the outer row. Newest profile row wins when there are several.
 */
const OUTER_ID = sql.raw('"interpreters"."id"');
const OUTER_NAME = sql.raw('"interpreters"."name"');

/** Preferred name from the profile, else the account name. */
export const interpreterDisplayName = sql<string>`coalesce(
  nullif(trim((
    select p.preferred_name from interpreter_profiles p
    where p.interpreter_id = ${OUTER_ID}::text
    order by p.updated_at desc
    limit 1
  )), ''),
  ${OUTER_NAME}
)`;

/** The profile photo path ("/api/files/<id>"), or null when there is none. */
export const interpreterPhotoUrl = sql<string | null>`(
  select nullif(trim(p.photo_url), '') from interpreter_profiles p
  where p.interpreter_id = ${OUTER_ID}::text
  order by p.updated_at desc
  limit 1
)`;
