/**
 * The billing engine's shapes. Money is whole US cents and time whole minutes everywhere in src/lib/billing, so totals add up
 * exactly; dollars and hours only appear when something is shown. Pure types: shared by the browser and the server.
 */

export type Cents = number;

/** Who pays: the State (ODHH), Apple Health (HCA / ProviderOne), or a Non-state organization. */
export type BillingCategory = "state" | "hca" | "non_state";

/** Non-state rounding after the 2-hour minimum: 30 minutes by default, 15 for a client that asks for it (TSD). */
export type ClientRounding = 15 | 30;

export interface BillingSettings {
  /** Cents per mile (76 = $0.76); may carry a fraction of a cent (72.5). */
  mileageRateCents: number;
  vendorFeeCents: Cents;
  onsiteFeeCents: Cents;
  defaultClientRateCents: Cents;
  nonStateRoundingMinutes: ClientRounding;
  stateRoundingMinutes: number;
  /** The business day the cancellation notice is counted in (minutes after midnight, Pacific). */
  businessDayStartMinute: number;
  businessDayEndMinute: number;
  /** Notice under this many business days makes a cancellation billable. */
  cancelNoticeBusinessDays: number;
  /** Evening window for travel time (minutes after midnight; may wrap past midnight). Null = no evening split. */
  eveningStartMinute: number | null;
  eveningEndMinute: number | null;
}

/** A Non-state organization's own terms (clients.data.billing). Null fields fall back to the agency defaults. */
export interface ClientBilling {
  rateCents: Cents | null;
  roundingMinutes: ClientRounding | null;
}

export interface InterpreterRates {
  stateCents: Cents | null;
  kingCountyCents: Cents | null;
  nonStateCents: Cents | null;
  /** Travel minutes in the evening window are paid at this rate, when it and the window are both set. */
  eveningCents: Cents | null;
}

/** How a job ended for billing. A cancellation is billable when the notice was short (or staff said so). */
export type JobOutcome = "completed" | "cancelled_billable" | "cancelled_not_billable";

export interface TimeWindow {
  start: string;
  end: string;
}

export interface PositionFacts {
  positionId: number;
  interpreterId: string | null;
  interpreterName: string;
  /** The approved hours' state. Only "approved" positions of a completed job are paid and billed. */
  hoursState: "approved" | "awaiting_review" | "missing";
  /** Worked minutes (actual end - start - break) from the approved hours; null when there are none. */
  workedMinutes: number | null;
  approvedMiles: number;
  /** Travel minutes: approved at review (approvedTravelMinutes), else the minutes in the submitted travel windows. */
  travelMinutes: number;
  /** The submitted travel windows (there and back on a state verification; one from an in-app form); empty when none. */
  travelWindows: TimeWindow[];
  /** A current commercial auto policy on the service date. */
  commercialAuto: boolean;
  rates: InterpreterRates;
  /** Non-state jobs with submitted hours have a Verification PDF for this position. */
  hasVerificationPdf: boolean;
}

/** STRICTLY AGENCY ONLY (PHI): what Kari types into ProviderOne. Only the HCA invoice view and its export carry it. */
export interface HcaBillingFields {
  clientName: string;
  dob: string;
  providerOne: string;
  priorAuth: string;
  modifier: string;
}

export interface JobFacts {
  requestId: string;
  /** "SRN #202786075" or "APT-1A2B3C". */
  reference: string;
  /** yyyy-MM-dd in the job's own zone. */
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  category: BillingCategory;
  inPerson: boolean;
  /** City (or "Virtual"): the only place detail payroll shows. */
  placeLabel: string;
  kingCounty: { value: boolean; source: "auto" | "staff"; matched: string | null };
  outcome: JobOutcome;
  /** "auto" = the 48-business-hour rule decided; "staff" = an override; "service" = the job happened. */
  outcomeSource: "auto" | "staff" | "service";
  /** Business minutes of notice a cancellation had (null for a completed job). */
  noticeBusinessMinutes: number | null;
  /** What the 48-business-hour rule says for a cancellation, even when staff overrode it (null for a completed job). */
  ruleOutcome: Exclude<JobOutcome, "completed"> | null;
  scheduledMinutes: number;
  client: { id: string | null; name: string | null; billing: ClientBilling };
  hca: HcaBillingFields | null;
  positions: PositionFacts[];
}

export type LineKind = "service" | "base_add_on" | "travel" | "travel_evening" | "mileage" | "vendor_fee" | "onsite_fee" | "commercial_auto";

export interface LineItem {
  kind: LineKind;
  label: string;
  quantity: number;
  unit: "hr" | "mi" | "each";
  /** Cents per unit (may carry a fraction for mileage). */
  rateCents: number;
  amountCents: Cents;
}

export interface PositionLedger {
  positionId: number;
  interpreterId: string | null;
  interpreterName: string;
  /** False while the hours are not approved: listed under "needs attention", never totalled. */
  included: boolean;
  /** Service + base add-on, in hours (the ProviderOne "billed units"). */
  billedUnits: number;
  pay: LineItem[];
  bill: LineItem[];
  payTotalCents: Cents;
  billTotalCents: Cents;
  warnings: string[];
}

export interface JobLedger {
  job: JobFacts;
  positions: PositionLedger[];
  payTotalCents: Cents;
  billTotalCents: Cents;
}
