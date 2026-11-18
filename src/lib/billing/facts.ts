import { closedJobKind } from "@/lib/closedJob";
import { matchesClientRequest } from "@/lib/clientRequestMatch";
import { positionOfOffer, readPositions } from "@/lib/positions";
import { isStateJobRequest } from "@/lib/stateJob";
import { formatDob } from "@/lib/validation/billingFields";
import { requestReference } from "@/utils/statusEngine";
import { resolveJobZone, resolveRequestTimes } from "@/utils/timezone";
import { billingCategoryOf } from "@/lib/billing/categories";
import { judgeCancellation } from "@/lib/billing/businessCalendar";
import type { BusinessCalendar } from "@/lib/billing/businessCalendar";
import { zonedDate } from "@/lib/billing/calendarDays";
import { detectKingCounty } from "@/lib/billing/kingCounty";
import { asObject, minutesBetween, num, str, workedMinutesOf } from "@/lib/billing/loose";
import { readTravelWindows, totalTravelMinutes } from "@/lib/travelWindows";
import type { BillingSettings, ClientBilling, InterpreterRates, JobFacts, JobOutcome, PositionFacts, TimeWindow } from "@/lib/billing/types";

/**
 * One job's billing facts, from its database rows only (never the hours-review browser cache). Pure: the loader (load.ts) reads the
 * rows, this decides what they mean, so every rule can be tested without a database.
 */

export interface RawRequest {
  id: string;
  status: string;
  createdAt: Date;
  canceledAt: Date | null;
  isStateJob: boolean;
  billingStatus: string | null;
  data: unknown;
}
export interface RawOffer {
  id: string;
  interpreterId: string;
  status: string;
  updatedAt: Date;
}
export interface RawTimesheet {
  id: string;
  interpreterId: string;
  status: string;
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  breakMinutes: number | null;
  billableHours: string | null;
  approvedMileage: string | null;
  travelStartTime: Date | null;
  travelEndTime: Date | null;
}
export interface ClientTerms {
  id: string;
  name: string;
  billing: ClientBilling;
}
export interface FactsContext {
  settings: BillingSettings;
  calendar: BusinessCalendar;
  names: ReadonlyMap<string, string>;
  rates: ReadonlyMap<string, InterpreterRates>;
  /** Interpreter id -> their active commercial auto policy's expiration (yyyy-MM-dd). */
  commercialAutoUntil: ReadonlyMap<string, string>;
  clients: readonly ClientTerms[];
}

const NO_RATES: InterpreterRates = { stateCents: null, kingCountyCents: null, nonStateCents: null, eveningCents: null };
const DEFAULT_TERMS: ClientBilling = { rateCents: null, roundingMinutes: null };

/** mapRequestRow's rule: a meeting link or a "virtual" format is online; anything else with a place is in person. */
function isInPerson(data: Record<string, unknown>): boolean {
  const details = asObject(data.details);
  const venue = str(asObject(data.onsite).venue);
  const format = str(details.format) || str(data.format) || (venue && !/virtual/i.test(venue) ? "In person" : "Virtual");
  const link = str(details.meetingLink) || str(details.virtualLink) || str(data.meetingLink) || str(data.virtualLink);
  return !/virtual/i.test(format) && !link;
}

/** "1200 Harbor Crest Ave, Seattle, WA 98104" -> "Seattle". */
export function addressCity(address: string): string {
  const named = /,\s*([A-Za-z][A-Za-z .'-]*?)\s*,?\s+(?:WA|Washington)\b/i.exec(address);
  if (named) return named[1].trim();
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : "";
}

type Outcome = Pick<JobFacts, "outcome" | "outcomeSource" | "noticeBusinessMinutes" | "ruleOutcome">;

function outcomeOf(req: RawRequest, data: Record<string, unknown>, startsAt: string, ctx: FactsContext): Outcome {
  const record = asObject(data.cancellation);
  const cancelledAt = new Date(str(record.at) || req.canceledAt?.toISOString() || startsAt);
  const judged = judgeCancellation(cancelledAt, new Date(startsAt), ctx.calendar, ctx.settings.cancelNoticeBusinessDays);
  const rule = { noticeBusinessMinutes: judged.noticeBusinessMinutes, ruleOutcome: judged.suggested };
  if (req.billingStatus === "cancelled_billable" || req.billingStatus === "cancelled_not_billable") return { outcome: req.billingStatus, outcomeSource: "staff", ...rule };
  return { outcome: judged.suggested, outcomeSource: "auto", ...rule };
}

/** The window the interpreter submitted, when both ends read. */
const windowOf = (start: unknown, end: unknown): TimeWindow | null => {
  const s = start instanceof Date ? start.toISOString() : str(start);
  const e = end instanceof Date ? end.toISOString() : str(end);
  return s && e && minutesBetween(s, e) > 0 ? { start: s, end: e } : null;
};

export function jobFacts(req: RawRequest, offers: readonly RawOffer[], sheets: readonly RawTimesheet[], ctx: FactsContext): JobFacts | null {
  const data = asObject(req.data);
  const closed = closedJobKind({ status: req.status, canceledAt: req.canceledAt, data });
  if (closed === "voided" || closed === "returned") return null;
  const cancelled = closed === "cancelled";

  const intake = asObject(data.intake);
  const details = asObject(data.details);
  const onsite = asObject(data.onsite);
  const zone = resolveJobZone(data);
  const { startsAt, endsAt } = resolveRequestTimes({ createdAt: req.createdAt, data });
  const category = billingCategoryOf({ program: str(intake.program), isStateJob: req.isStateJob });
  const inPerson = isInPerson(data);
  const addressTexts = [str(onsite.address), str(data.location), str(onsite.venue), str(asObject(data.overview).location)];
  const override = asObject(data.billing).kingCounty;
  const detected = inPerson ? detectKingCounty(addressTexts) : { kingCounty: false, matched: null };
  const client = ctx.clients.find((c) => matchesClientRequest({ data }, c.name)) ?? null;

  const outcome: Outcome = cancelled
    ? outcomeOf(req, data, startsAt, ctx)
    : { outcome: "completed" as JobOutcome, outcomeSource: "service", noticeBusinessMinutes: null, ruleOutcome: null };

  const hours = asObject(data.hoursSubmissions);
  const legacy = asObject(data.hoursSubmission);
  const pdfEligible = !isStateJobRequest({ isStateJob: req.isStateJob, data });
  const serviceDate = zonedDate(startsAt, zone);
  const booked = offers.filter((o) => o.status === (cancelled ? "cancelled" : "accepted")).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const positions: PositionFacts[] = [];
  const ids = new Set<number>([...readPositions(data).ids, ...Object.keys(hours).map(Number).filter((n) => Number.isInteger(n) && n >= 1)]);
  for (const positionId of Array.from(ids).sort((a, b) => a - b)) {
    const slot = asObject(hours[positionId] ?? (positionId === 1 && Object.keys(legacy).length > 0 ? legacy : null));
    const offer = booked.find((o) => positionOfOffer(data.offerPositions, o.id) === positionId);
    const interpreterId = str(slot.interpreterId) || offer?.interpreterId || null;
    const sheet = interpreterId ? sheets.find((s) => s.interpreterId === interpreterId && s.status === "approved") ?? sheets.find((s) => s.interpreterId === interpreterId) : undefined;
    const hasSlot = Object.keys(slot).length > 0;
    if (!interpreterId || (!offer && !hasSlot && !sheet) || (cancelled && !offer)) continue;

    const slotApproved = str(slot.status) === "approved";
    const sheetApproved = sheet?.status === "approved";
    const hoursState: PositionFacts["hoursState"] = slotApproved || sheetApproved ? "approved" : hasSlot || sheet ? "awaiting_review" : "missing";
    const worked = slotApproved
      ? workedMinutesOf(slot.actualStartTime, slot.actualEndTime, slot.breakMinutes, null)
      : sheetApproved && sheet
        ? workedMinutesOf(sheet.actualStartTime, sheet.actualEndTime, sheet.breakMinutes, sheet.billableHours)
        : null;
    // Every leg a state verification (or staff, from the receipt) recorded for this timesheet; else the single window on file.
    const single = windowOf(slot.travelStartTime, slot.travelEndTime) ?? (sheet ? windowOf(sheet.travelStartTime, sheet.travelEndTime) : null);
    const windows = readTravelWindows(data, str(slot.timesheetId) || sheet?.id) ?? (single ? [single] : []);
    const approvedTravel = num(slot.approvedTravelMinutes);
    const miles = slotApproved ? num(slot.approvedMileage) : sheetApproved && sheet ? num(sheet.approvedMileage) : null;
    const until = ctx.commercialAutoUntil.get(interpreterId);

    positions.push({
      positionId,
      interpreterId,
      interpreterName: ctx.names.get(interpreterId) || str(slot.interpreterName) || `Position ${positionId}`,
      hoursState,
      workedMinutes: worked,
      approvedMiles: miles ?? 0,
      travelMinutes: approvedTravel ?? totalTravelMinutes(windows),
      travelWindows: windows,
      commercialAuto: Boolean(until && until >= serviceDate),
      rates: ctx.rates.get(interpreterId) ?? NO_RATES,
      hasVerificationPdf: pdfEligible && hasSlot && Boolean(str(slot.actualStartTime)),
    });
  }

  return {
    requestId: req.id,
    reference: requestReference(str(intake.odhhSrn), req.id),
    serviceDate,
    startsAt,
    endsAt,
    timeZone: zone,
    category,
    inPerson,
    placeLabel: inPerson ? addressCity(addressTexts[0] || addressTexts[1]) || "In person" : "Virtual",
    kingCounty: typeof override === "boolean" ? { value: override, source: "staff", matched: detected.matched } : { value: detected.kingCounty, source: "auto", matched: detected.matched },
    ...outcome,
    scheduledMinutes: Math.max(0, Math.round(minutesBetween(startsAt, endsAt))),
    client: { id: client?.id ?? null, name: client?.name ?? null, billing: client?.billing ?? DEFAULT_TERMS },
    hca:
      category === "hca"
        ? {
            clientName: str(details.deafParticipant),
            dob: formatDob(str(intake.clientDob)),
            providerOne: str(intake.providerOneNumber),
            priorAuth: str(intake.priorAuthNumber),
            modifier: str(intake.billingModifier),
          }
        : null,
    positions,
  };
}
