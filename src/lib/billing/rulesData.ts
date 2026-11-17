import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, interpreterProfiles } from "@/db/schema";
import { centsToInput, toCents } from "@/lib/billing/money";
import { clientBillingOf } from "@/lib/billing/settings";
import { loadEveningRates } from "@/lib/billing/store";
import { getRosterInterpreters } from "@/lib/roster";

/** What Billing > Rates & rules edits besides the settings: each organization's terms and each roster interpreter's rates. SERVER ONLY. */

export interface ClientTermsRow {
  id: string;
  name: string;
  /** "85.00", or "" for the agency default. */
  rate: string;
  roundingMinutes: "" | "15" | "30";
}

export interface InterpreterRateRow {
  id: string;
  name: string;
  stateRate: string;
  kingCountyRate: string;
  nonStateRate: string;
  eveningRate: string;
}

export async function loadClientTerms(): Promise<ClientTermsRow[]> {
  const rows = await db.select({ id: clients.id, name: clients.name, data: clients.data }).from(clients).where(eq(clients.archived, false)).orderBy(asc(clients.name));
  return rows.map((c) => {
    const terms = clientBillingOf(c.data);
    return { id: c.id, name: c.name, rate: centsToInput(terms.rateCents), roundingMinutes: terms.roundingMinutes === null ? "" : terms.roundingMinutes === 15 ? "15" : "30" };
  });
}

export async function loadInterpreterRates(agencyId: string): Promise<InterpreterRateRow[]> {
  const roster = await getRosterInterpreters(agencyId);
  const ids = roster.map((r) => r.id);
  if (ids.length === 0) return [];
  const profiles = await db
    .select({ id: interpreterProfiles.interpreterId, state: interpreterProfiles.stateRate, king: interpreterProfiles.kingCountyRate, nonState: interpreterProfiles.nonStateRate })
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, ids))
    .orderBy(desc(interpreterProfiles.updatedAt));
  const newest = new Map<string, (typeof profiles)[number]>();
  for (const p of profiles) if (!newest.has(p.id)) newest.set(p.id, p);
  const evening = await loadEveningRates(agencyId, ids);
  const text = (v: string | null | undefined): string => centsToInput(toCents(v ?? null));
  return roster
    .map((r) => {
      const p = newest.get(r.id);
      const e = evening.get(r.id);
      return { id: r.id, name: r.name, stateRate: text(p?.state), kingCountyRate: text(p?.king), nonStateRate: text(p?.nonState), eveningRate: e === undefined ? "" : centsToInput(e) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
