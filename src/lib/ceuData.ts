import { requireInterpreter } from "@/lib/auth/guards";
import { isMissingTable } from "@/lib/availability/personalJobConflict";
import type { CeuView } from "@/lib/ceu";
import { readCeu } from "@/lib/ceuStore";
import { logError } from "@/lib/logError";

/**
 * What the CEUs & renewals tab needs, for the signed-in interpreter only (plain server code, called by the tab's loader action):
 *  - "ok": their cycles and entries;
 *  - "not_ready": the tables from migration 0017 are not on this database yet, so the tab says so instead of failing the page;
 *  - "not_linked": the login is not linked to an interpreter profile yet;
 *  - "error": anything else (logged by code only; nothing the interpreter typed is printed).
 */
export type CeuData = ({ status: "ok" } & CeuView) | { status: "not_ready" | "not_linked" | "error" };

export async function loadCeu(): Promise<CeuData> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { status: "not_linked" };
  }
  try {
    return { status: "ok", ...(await readCeu(interpreterId)) };
  } catch (err) {
    if (isMissingTable(err)) return { status: "not_ready" };
    logError("loadCeu", err);
    return { status: "error" };
  }
}
