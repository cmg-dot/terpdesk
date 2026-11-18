import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, interpreterProfiles, interpreters, offers, requests, timesheets } from "@/db/schema";
import { ensureDisplayNameColumns, interpreterDisplayName } from "@/lib/displayName";
import { commercialAutoExpirations } from "@/lib/insuranceStore";
import { resolveJobZone, resolveRequestTimes } from "@/utils/timezone";
import { calendarFrom } from "@/lib/billing/businessCalendar";
import { zonedDate } from "@/lib/billing/calendarDays";
import { jobFacts } from "@/lib/billing/facts";
import type { ClientTerms, RawOffer, RawRequest, RawTimesheet } from "@/lib/billing/facts";
import type { Holiday } from "@/lib/billing/holidays";
import { jobLedger } from "@/lib/billing/lines";
import { toCents } from "@/lib/billing/money";
import { clientBillingOf } from "@/lib/billing/settings";
import { loadEveningRates } from "@/lib/billing/store";
import type { BillingSettings, InterpreterRates, JobLedger } from "@/lib/billing/types";

/**
 * Every job whose service date falls in [start, end] (the job's own calendar), as billing ledgers. Reads the database only: the
 * requests, their bookings (accepted offers; for a cancelled job, the bookings the cancellation closed), both stores of hours (the
 * request's hours slots and the timesheets table), the interpreters' rates and commercial auto policies, and the organizations' own
 * terms. Voided and returned jobs are never billed. The agency-only guard belongs to the caller. SERVER ONLY.
 */

/** Requests that can bill: something was booked on them, or hours were reported. */
const billable = or(
  inArray(requests.id, db.select({ id: offers.requestId }).from(offers).where(inArray(offers.status, ["accepted", "cancelled"]))),
  inArray(requests.id, db.select({ id: timesheets.requestId }).from(timesheets)),
  sql`jsonb_typeof(${requests.data} -> 'hoursSubmissions') = 'object'`,
);

async function interpreterFacts(agencyId: string, ids: string[]) {
  const names = new Map<string, string>();
  const rates = new Map<string, InterpreterRates>();
  if (ids.length === 0) return { names, rates, autos: new Map<string, string>() };
  await ensureDisplayNameColumns();
  const people = await db.select({ id: interpreters.id, name: interpreterDisplayName }).from(interpreters).where(inArray(interpreters.id, ids));
  for (const p of people) names.set(p.id, p.name);
  // Older data can hold several profile rows per interpreter; the newest is the one everything reads.
  const profiles = await db
    .select({ id: interpreterProfiles.interpreterId, state: interpreterProfiles.stateRate, king: interpreterProfiles.kingCountyRate, nonState: interpreterProfiles.nonStateRate })
    .from(interpreterProfiles)
    .where(inArray(interpreterProfiles.interpreterId, ids))
    .orderBy(desc(interpreterProfiles.updatedAt));
  const evening = await loadEveningRates(agencyId, ids);
  for (const p of profiles) {
    if (rates.has(p.id)) continue;
    rates.set(p.id, { stateCents: toCents(p.state), kingCountyCents: toCents(p.king), nonStateCents: toCents(p.nonState), eveningCents: evening.get(p.id) ?? null });
  }
  for (const id of ids) if (!rates.has(id)) rates.set(id, { stateCents: null, kingCountyCents: null, nonStateCents: null, eveningCents: evening.get(id) ?? null });
  return { names, rates, autos: await commercialAutoExpirations(ids) };
}

export async function loadLedgers(agencyId: string, range: { start: string; end: string }, settings: BillingSettings, holidays: readonly Holiday[]): Promise<JobLedger[]> {
  const rows: RawRequest[] = await db
    .select({ id: requests.id, status: requests.status, createdAt: requests.createdAt, canceledAt: requests.canceledAt, isStateJob: requests.isStateJob, billingStatus: requests.billingStatus, data: requests.data })
    .from(requests)
    .where(billable);
  // The service date is worked out from the job's own fields (several shapes over time), so the period is applied here.
  const inRange = rows.filter((r) => {
    const date = zonedDate(resolveRequestTimes({ createdAt: r.createdAt, data: r.data }).startsAt, resolveJobZone(r.data));
    return range.start <= date && date <= range.end;
  });
  if (inRange.length === 0) return [];
  const ids = inRange.map((r) => r.id);

  const offerRows = await db
    .select({ id: offers.id, requestId: offers.requestId, interpreterId: offers.interpreterId, status: offers.status, updatedAt: offers.updatedAt })
    .from(offers)
    .where(and(inArray(offers.requestId, ids), inArray(offers.status, ["accepted", "cancelled"])));
  const sheetRows = await db
    .select({
      id: timesheets.id,
      requestId: timesheets.requestId,
      interpreterId: timesheets.interpreterId,
      status: timesheets.status,
      actualStartTime: timesheets.actualStartTime,
      actualEndTime: timesheets.actualEndTime,
      breakMinutes: timesheets.breakMinutes,
      billableHours: timesheets.billableHours,
      approvedMileage: timesheets.approvedMileage,
      travelStartTime: timesheets.travelStartTime,
      travelEndTime: timesheets.travelEndTime,
    })
    .from(timesheets)
    .where(and(inArray(timesheets.requestId, ids), inArray(timesheets.status, ["submitted", "approved"])));
  const clientRows = await db.select({ id: clients.id, name: clients.name, data: clients.data }).from(clients).where(eq(clients.archived, false));

  const people = new Set<string>([...offerRows.map((o) => o.interpreterId), ...sheetRows.map((s) => s.interpreterId)]);
  for (const r of inRange) {
    const hours = (r.data as { hoursSubmissions?: Record<string, { interpreterId?: unknown }> } | null)?.hoursSubmissions ?? {};
    for (const slot of Object.values(hours)) if (typeof slot?.interpreterId === "string") people.add(slot.interpreterId);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const { names, rates, autos } = await interpreterFacts(agencyId, Array.from(people).filter((id) => uuid.test(id)));

  const ctx = {
    settings,
    calendar: calendarFrom(settings, holidays.map((h) => h.date)),
    names,
    rates,
    commercialAutoUntil: autos,
    clients: clientRows.map((c): ClientTerms => ({ id: c.id, name: c.name, billing: clientBillingOf(c.data) })),
  };
  const ledgers: JobLedger[] = [];
  for (const r of inRange) {
    const own: RawOffer[] = offerRows.filter((o) => o.requestId === r.id);
    const sheets: RawTimesheet[] = sheetRows.filter((s) => s.requestId === r.id);
    const facts = jobFacts(r, own, sheets, ctx);
    if (facts && facts.positions.length > 0) ledgers.push(jobLedger(facts, settings));
  }
  return ledgers.sort((a, b) => a.job.serviceDate.localeCompare(b.job.serviceDate));
}
