import { mock } from "node:test";
import { getTableName } from "drizzle-orm";
import type { Table } from "drizzle-orm";

/**
 * A stand-in for the database and the sign-in session, for tests of the availability and personal-jobs code. Nothing here connects to
 * anything: the real `db` object has its query methods replaced by recorders that answer from a table-name -> rows map, and `next-auth` /
 * `next/cache` are mocked (run with --experimental-test-module-mocks, which `npm test` passes). The rows the fake returns are not
 * filtered the way SQL would filter them, so a test sets up exactly the rows the query should have found; `wheres` keeps each
 * condition so a test can check HOW a query compares (render it with `renderWhere`).
 */

export interface FakeSession {
  user: { id: string; email?: string; role: "agency" | "interpreter"; interpreterId: string | null; idleExpired?: boolean };
}

export const state: {
  session: FakeSession | null;
  rows: Record<string, unknown[]>;
  /** What an insert/update/delete `.returning()` answers, per table (an insert falls back to the inserted values plus an id). */
  returning: Record<string, unknown[]>;
  /** The answer to a `select({ total: count() })` per table (else the number of rows set for it). */
  counts: Record<string, number>;
  /** Table names whose next read throws (once). */
  failOnce: Set<string>;
  /** Table names whose reads always throw. */
  failAlways: Set<string>;
  /** Table names whose reads always throw this specific error (for example one carrying a Postgres code). */
  errors: Record<string, Error>;
  ops: string[];
  inserted: { table: string; values: unknown }[];
  updated: { table: string; set: unknown }[];
  /** Each select: the table and the field names asked for (empty for `select()`). */
  selects: { table: string; fields: string[] }[];
  wheres: { table: string; condition: unknown }[];
} = {
  session: null, rows: {}, returning: {}, counts: {}, failOnce: new Set(), failAlways: new Set(), errors: {},
  ops: [], inserted: [], updated: [], selects: [], wheres: [],
};

export function reset(): void {
  state.session = null;
  state.rows = {};
  state.returning = {};
  state.counts = {};
  state.failOnce.clear();
  state.failAlways.clear();
  state.errors = {};
  state.ops = [];
  state.inserted = [];
  state.updated = [];
  state.selects = [];
  state.wheres = [];
}

interface Chain extends PromiseLike<unknown[]> {
  innerJoin: (...args: unknown[]) => Chain;
  leftJoin: (...args: unknown[]) => Chain;
  where: (condition?: unknown) => Chain;
  orderBy: (...args: unknown[]) => Chain;
  limit: (...args: unknown[]) => Chain;
}

function chain(table: string, fields: string[]): Chain {
  const self: Chain = {
    innerJoin: () => self,
    leftJoin: () => self,
    where: (condition) => {
      state.wheres.push({ table, condition });
      return self;
    },
    orderBy: () => self,
    limit: () => self,
    then: (onFulfilled, onRejected) => {
      const error = state.errors[table];
      if (error) return Promise.reject(error).then(onFulfilled, onRejected);
      if (state.failAlways.has(table) || state.failOnce.has(table)) {
        state.failOnce.delete(table);
        return Promise.reject(new Error(`fake db: ${table} unavailable`)).then(onFulfilled, onRejected);
      }
      if (fields.includes("total")) return Promise.resolve([{ total: state.counts[table] ?? (state.rows[table]?.length ?? 0) }]).then(onFulfilled, onRejected);
      return Promise.resolve(state.rows[table] ?? []).then(onFulfilled, onRejected);
    },
  };
  return self;
}

/** A write that can be awaited as it is, or asked for `.returning()`. */
function write(table: string, fallback: () => unknown[]): PromiseLike<void> & { returning: (fields?: unknown) => Promise<unknown[]> } {
  const answer = (): unknown[] => state.returning[table] ?? fallback();
  return {
    then: (onFulfilled, onRejected) => Promise.resolve().then(onFulfilled, onRejected),
    returning: async () => answer(),
  };
}

let installed = false;

/** Mocks the session and cache modules and swaps the real db's query methods. Call once, before importing the code under test. */
export async function install(): Promise<void> {
  if (installed) return;
  installed = true;
  mock.module("next-auth", { namedExports: { getServerSession: async () => state.session, default: () => null } });
  mock.module("next/cache", { namedExports: { revalidatePath: () => undefined, revalidateTag: () => undefined } });
  const { db } = await import("@/db");
  const fake = db as unknown as Record<string, unknown>;
  fake.select = (selected?: Record<string, unknown>) => ({
    from: (t: Table) => {
      const name = getTableName(t);
      const fields = selected ? Object.keys(selected) : [];
      state.ops.push(`select:${name}`);
      state.selects.push({ table: name, fields });
      return chain(name, fields);
    },
  });
  // Runtime "ALTER TABLE ... IF NOT EXISTS" helpers some readers call first: nothing to do against a stub.
  fake.execute = async () => {
    state.ops.push("execute");
    return [];
  };
  fake.insert = (t: Table) => ({
    values: (values: unknown) => {
      const table = getTableName(t);
      state.ops.push(`insert:${table}`);
      state.inserted.push({ table, values });
      const one = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
      const base = { createdAt: new Date(0), updatedAt: new Date(0) };
      return write(table, () => one.map((v, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, ...base, ...v })));
    },
  });
  fake.update = (t: Table) => ({
    set: (set: unknown) => ({
      where: (condition?: unknown) => {
        const table = getTableName(t);
        state.ops.push(`update:${table}`);
        state.updated.push({ table, set });
        state.wheres.push({ table, condition });
        return write(table, () => []);
      },
    }),
  });
  fake.delete = (t: Table) => ({
    where: (condition?: unknown) => {
      const table = getTableName(t);
      state.ops.push(`delete:${table}`);
      state.wheres.push({ table, condition });
      return write(table, () => []);
    },
  });
}

/** The SQL text and bound values a recorded `where` condition would send. */
export async function renderWhere(condition: unknown): Promise<{ sql: string; params: unknown[] }> {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { sql, params } = new PgDialect().sqlToQuery(condition as Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0]);
  return { sql, params };
}

export const agency = (): FakeSession => ({ user: { id: "staff-1", role: "agency", interpreterId: null } });
export const interpreter = (interpreterId: string): FakeSession => ({ user: { id: "login-1", email: "terp@example.invalid", role: "interpreter", interpreterId } });
