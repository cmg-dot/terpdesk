import { DEFAULT_BILLING_SETTINGS } from "@/lib/billing/settings";
import type { BillingSettings, InterpreterRates, JobFacts, PositionFacts } from "@/lib/billing/types";

/** Builders for the billing tests. Every person and number here is made up except the rules and Kari's own rates. */

export const settings = (overrides: Partial<BillingSettings> = {}): BillingSettings => ({ ...DEFAULT_BILLING_SETTINGS, ...overrides });

export const rates = (overrides: Partial<InterpreterRates> = {}): InterpreterRates => ({
  stateCents: null,
  kingCountyCents: null,
  nonStateCents: null,
  eveningCents: null,
  ...overrides,
});

export const position = (overrides: Partial<PositionFacts> = {}): PositionFacts => ({
  positionId: 1,
  interpreterId: "11111111-1111-4111-8111-111111111111",
  interpreterName: "Test Interpreter",
  hoursState: "approved",
  workedMinutes: 60,
  approvedMiles: 0,
  travelMinutes: 0,
  travelWindow: null,
  commercialAuto: false,
  rates: rates(),
  hasVerificationPdf: false,
  ...overrides,
});

export const job = (overrides: Partial<JobFacts> = {}): JobFacts => ({
  requestId: "22222222-2222-4222-8222-222222222222",
  reference: "APT-TEST01",
  serviceDate: "2026-10-15",
  startsAt: "2026-10-15T23:00:00.000Z",
  endsAt: "2026-10-16T00:30:00.000Z",
  timeZone: "America/Los_Angeles",
  category: "state",
  inPerson: false,
  placeLabel: "Virtual",
  kingCounty: { value: false, source: "auto", matched: null },
  outcome: "completed",
  outcomeSource: "service",
  noticeBusinessMinutes: null,
  ruleOutcome: null,
  scheduledMinutes: 90,
  client: { id: null, name: null, billing: { rateCents: null, roundingMinutes: null } },
  hca: null,
  positions: [position()],
  ...overrides,
});

/** Amounts of a ledger side by kind, for readable assertions. */
export const amounts = (lines: { kind: string; amountCents: number }[]): Record<string, number> =>
  lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.kind]: (acc[l.kind] ?? 0) + l.amountCents }), {});
