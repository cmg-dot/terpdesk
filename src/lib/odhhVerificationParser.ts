import {
  EMPTY_VALUE,
  SRN_PATTERNS,
  TIME_FRAGMENT,
  cleanValue,
  labelPattern,
  normalizeEmailText,
  sanitizeSrn,
  to24HourTime,
  toIsoDate,
} from "@/lib/odhhEmailParser";

/**
 * Parser for ODHH "SERVICE VERIFICATION" emails: the state's own receipt for a finished appointment, which acts as
 * the timesheet. Pure functions, no I/O. The AWS Lambda detects the type and may extract the same fields; the server
 * re-reads the raw email with this parser and uses the Lambda's values only to fill gaps.
 */

export type IntakeType = "job_offer" | "timesheet";

/** The phrase that marks a service verification (case-sensitive, as ODHH prints it). */
const VERIFICATION_MARKER = /SERVICE VERIFICATION/;

export function looksLikeServiceVerification(rawContent: string): boolean {
  return VERIFICATION_MARKER.test(normalizeEmailText(rawContent));
}

/** The sender's `type` when valid, otherwise inferred from the email text (so an older Lambda keeps working). */
export function resolveIntakeType(declared: unknown, rawContent: string): IntakeType {
  if (declared === "job_offer" || declared === "timesheet") return declared;
  return looksLikeServiceVerification(rawContent) ? "timesheet" : "job_offer";
}

/** Values the Lambda extracted itself (all optional, all untrusted strings). */
export interface VerificationHints {
  srn?: unknown;
  actualStartTime?: unknown;
  actualEndTime?: unknown;
  totalMiles?: unknown;
  otherFees?: unknown;
}

export interface ParsedServiceVerification {
  srn: string | null;
  /** Date written in the start value, as yyyy-MM-dd, when it has one. */
  startDate: string | null;
  /** 24-hour "HH:mm". */
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  /** Total miles; 0 when the email says none. Null when not found. */
  totalMiles: number | null;
  /** Other fees as written (for the record), and the dollar amount when one is given. */
  otherFeesText: string | null;
  otherFeesAmount: number | null;
}

const ACTUAL_START = labelPattern(["Actual[ \\t]+Start(?:[ \\t]+Time)?", "Actual[ \\t]+Time[ \\t]+In"]);
const ACTUAL_END = labelPattern(["Actual[ \\t]+End(?:[ \\t]+Time)?", "Actual[ \\t]+Stop(?:[ \\t]+Time)?", "Actual[ \\t]+Time[ \\t]+Out"]);
const MILEAGE = labelPattern([
  "Total[ \\t]+Mile(?:s|age)",
  "To[ \\t]+Mile(?:s|age)",
  "Travel[ \\t]+Mile(?:s|age)",
  "Mile(?:s|age)",
]);
const OTHER_FEES = labelPattern(["Other[ \\t]+Fee(?:s|\\(s\\))", "Additional[ \\t]+Fee(?:s|\\(s\\))"]);

const MAX_MILES = 2000;
const MAX_FEES = 10000;
const DATE_IN_VALUE = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;
const TIME_IN_VALUE = new RegExp(`(${TIME_FRAGMENT})`);

const asText = (value: unknown): string | undefined => (typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined);

/** "12/15/2026 8:00 AM" | "8:00 AM" -> { date: "2026-12-15" | null, time: "08:00" | null } */
function parseDateTimeValue(value: string | null): { date: string | null; time: string | null } {
  if (!value) return { date: null, time: null };
  const dateText = value.match(DATE_IN_VALUE)?.[1];
  const timeText = value.match(TIME_IN_VALUE)?.[1];
  return { date: dateText ? toIsoDate(dateText) : null, time: timeText ? to24HourTime(timeText) : null };
}

function parseMiles(value: string | null): number | null {
  if (!value) return null;
  if (EMPTY_VALUE.test(value)) return 0;
  const number = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
  if (!number) return null;
  const miles = Number(number);
  return Number.isFinite(miles) && miles >= 0 && miles <= MAX_MILES ? Math.round(miles * 10) / 10 : null;
}

function parseFees(value: string | null): { text: string | null; amount: number | null } {
  if (!value) return { text: null, amount: null };
  if (EMPTY_VALUE.test(value)) return { text: null, amount: 0 };
  const number = value.replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/)?.[0];
  const amount = number === undefined ? null : Number(number);
  return { text: value.slice(0, 100), amount: amount !== null && Number.isFinite(amount) && amount >= 0 && amount <= MAX_FEES ? amount : null };
}

export function parseServiceVerification(rawContent: string, hints: VerificationHints = {}): ParsedServiceVerification {
  const text = normalizeEmailText(rawContent);
  const pick = (pattern: RegExp, hint: unknown): string | null => cleanValue(text.match(pattern)?.[1]) ?? cleanValue(asText(hint));

  let srn: string | null = null;
  for (const pattern of SRN_PATTERNS) {
    srn = sanitizeSrn(text.match(pattern)?.[1]);
    if (srn) break;
  }
  srn = srn ?? sanitizeSrn(cleanValue(asText(hints.srn)) ?? undefined);

  const start = parseDateTimeValue(pick(ACTUAL_START, hints.actualStartTime));
  const end = parseDateTimeValue(pick(ACTUAL_END, hints.actualEndTime));
  const fees = parseFees(pick(OTHER_FEES, hints.otherFees));

  return {
    srn,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    totalMiles: parseMiles(pick(MILEAGE, hints.totalMiles)),
    otherFeesText: fees.text,
    otherFeesAmount: fees.amount,
  };
}

/** Names of the required fields that could not be read (SRN, start and end time). Empty when usable. */
export function missingVerificationFields(parsed: ParsedServiceVerification): string[] {
  const missing: string[] = [];
  if (!parsed.srn) missing.push("srn");
  if (!parsed.startTime) missing.push("actualStartTime");
  if (!parsed.endTime) missing.push("actualEndTime");
  return missing;
}
