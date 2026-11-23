import { mock } from "node:test";
import { getTableName } from "drizzle-orm";
import type { Table } from "drizzle-orm";

/**
 * A stand-in for the database and the sign-in session, for tests of the availability code. Nothing here connects to anything: the real
 * `db` object has its query methods replaced by recorders that answer from a table-name -> rows map, and `next-auth` / `next/cache` are
 * mocked (run with --experimental-test-module-mocks, which `npm test` passes). The rows the fake returns are not filtered the way SQL
 * would filter them, so a test sets up exactly the rows the query should have found.
 */

export interface FakeSession {
  user: { id: string; role: "agency" | "interpreter"; interpreterId: string | null; idleExpired?: boolean };
}

export const state: {
  session: FakeSession | null;
  rows: Record<string, unknown[]>;
  /** Table names whose next read throws (once). */
  failOnce: Set<string>;
  /** Table names whose reads always throw. */
  failAlways: Set<string>;
  ops: string[];
  inserted: { table: string; values: unknown }[];
  updated: { table: string; set: unknown }[];
} = { session: null, rows: {}, failOnce: new Set(), failAlways: new Set(), ops: [], inserted: [], updated: [] };

export function reset(): void {
  state.session = null;
  state.rows = {};
  state.failOnce.clear();
  state.failAlways.clear();
  state.ops = [];
  state.inserted = [];
  state.updated = [];
}

interface Chain extends PromiseLike<unknown[]> {
  innerJoin: (...args: unknown[]) => Chain;
  where: (...args: unknown[]) => Chain;
  orderBy: (...args: unknown[]) => Chain;
  limit: (...args: unknown[]) => Chain;
}

function chain(table: string): Chain {
  const self: Chain = {
    innerJoin: () => self,
    where: () => self,
    orderBy: () => self,
    limit: () => self,
    then: (onFulfilled, onRejected) => {
      if (state.failAlways.has(table) || state.failOnce.has(table)) {
        state.failOnce.delete(table);
        return Promise.reject(new Error(`fake db: ${table} unavailable`)).then(onFulfilled, onRejected);
      }
      return Promise.resolve(state.rows[table] ?? []).then(onFulfilled, onRejected);
    },
  };
  return self;
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
  fake.select = () => ({
    from: (t: Table) => {
      const name = getTableName(t);
      state.ops.push(`select:${name}`);
      return chain(name);
    },
  });
  fake.insert = (t: Table) => ({
    values: async (values: unknown) => {
      const table = getTableName(t);
      state.ops.push(`insert:${table}`);
      state.inserted.push({ table, values });
    },
  });
  fake.update = (t: Table) => ({
    set: (set: unknown) => ({
      where: async () => {
        const table = getTableName(t);
        state.ops.push(`update:${table}`);
        state.updated.push({ table, set });
      },
    }),
  });
  fake.delete = (t: Table) => ({
    where: async () => {
      state.ops.push(`delete:${getTableName(t)}`);
    },
  });
}

export const agency = (): FakeSession => ({ user: { id: "staff-1", role: "agency", interpreterId: null } });
export const interpreter = (interpreterId: string): FakeSession => ({ user: { id: "login-1", role: "interpreter", interpreterId } });
