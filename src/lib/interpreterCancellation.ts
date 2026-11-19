import { z } from "zod";
import { calendarFrom, judgeCancellation } from "@/lib/billing/businessCalendar";
import { waStateHolidays } from "@/lib/billing/holidays";
import { asObject, str } from "@/lib/billing/loose";
import { DEFAULT_BILLING_SETTINGS } from "@/lib/billing/settings";
import type { BillingSettings } from "@/lib/billing/types";
import { resolveRequestTimes } from "@/utils/timezone";

/**
 * What an interpreter is told about a booking the agency cancelled: whether the cancellation is billable (the same answer billing
 * gives the agency) and when it was made. Nothing about the job. The rule is billing's own (lib/billing/businessCalendar.ts):
 * less than 2 business days of notice, Monday to Friday 8 to 5 Pacific, holidays excluded; staff's override
 * (`requests.billing_status`) wins. Pure.
 */

export interface InterpreterCancellation {
  billable: boolean;
  /** ISO instant the cancellation was made. */
  cancelledAt: string;
}

export interface CancellationRules {
  settings: Pick<BillingSettings, "businessDayStartMinute" | "businessDayEndMinute" | "cancelNoticeBusinessDays">;
  /** yyyy-MM-dd holidays; null = the standard Washington State holidays around the dates judged (billing tables not set up yet). */
  holidays: readonly string[] | null;
}

export const DEFAULT_CANCELLATION_RULES: CancellationRules = { settings: DEFAULT_BILLING_SETTINGS, holidays: null };

export interface CancelledRequest {
  canceledAt: Date | null;
  /** requests.billing_status: staff's decision, null when billing's rule decides. */
  billingStatus: string | null;
  createdAt: Date;
  data: unknown;
}

const yearOf = (date: Date): number => date.getUTCFullYear();

const MAX_TRAVEL_MS = 24 * 3_600_000;
const NOTE_REQUIRED = "Add a note about the cancellation.";

/** The cancellation form's own fields (security.md: a strict schema on every mutating action). The times and mileage are never taken from the browser. */
const cancellationFormSchema = z
  .object({
    note: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().trim().min(1, NOTE_REQUIRED).max(1000, "The note must be 1,000 characters or fewer.")),
    travelStart: z.string().trim().nullish(),
    travelEnd: z.string().trim().nullish(),
  })
  .superRefine((form, ctx) => {
    const start = form.travelStart ? Date.parse(form.travelStart) : null;
    const end = form.travelEnd ? Date.parse(form.travelEnd) : null;
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if ((start === null) !== (end === null)) return fail("Enter both the start and the end of your travel, or leave both empty.");
    if (start === null || end === null) return;
    if (Number.isNaN(start) || Number.isNaN(end)) return fail("The travel times are not valid.");
    if (end <= start) return fail("Travel end must be after travel start.");
    if (end - start > MAX_TRAVEL_MS) return fail("Travel cannot be longer than 24 hours.");
  });

/**
 * What a cancellation form must hold, checked on the server: a note, and travel that is either empty or a real window (both ends,
 * in order, within a day). Throws the message the form shows.
 */
export function assertCancellationForm(input: { note: string | undefined; travelStart?: string | null; travelEnd?: string | null }): void {
  const checked = cancellationFormSchema.safeParse(input);
  if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? NOTE_REQUIRED);
}

/** The cancellation's billing outcome for a cancelled request, as billing computes it (facts.ts: the same cancelled-at, start and rule). */
export function cancellationOf(req: CancelledRequest, rules: CancellationRules = DEFAULT_CANCELLATION_RULES): InterpreterCancellation {
  const data = asObject(req.data);
  const startsAt = new Date(resolveRequestTimes({ createdAt: req.createdAt, data }).startsAt);
  const recordedAt = str(asObject(data.cancellation).at) || req.canceledAt?.toISOString() || "";
  const cancelledAt = new Date(recordedAt || startsAt);
  // Without a usable time the rule cannot be applied: say not billable and let staff decide with their override.
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(cancelledAt.getTime())) {
    return { billable: req.billingStatus === "cancelled_billable", cancelledAt: "" };
  }
  const iso = cancelledAt.toISOString();
  if (req.billingStatus === "cancelled_billable") return { billable: true, cancelledAt: iso };
  if (req.billingStatus === "cancelled_not_billable") return { billable: false, cancelledAt: iso };

  const holidays = rules.holidays ?? Array.from(new Set([yearOf(cancelledAt), yearOf(startsAt)])).flatMap((y) => waStateHolidays(y).map((h) => h.date));
  const judged = judgeCancellation(cancelledAt, startsAt, calendarFrom(rules.settings, holidays), rules.settings.cancelNoticeBusinessDays);
  return { billable: judged.suggested === "cancelled_billable", cancelledAt: iso };
}
