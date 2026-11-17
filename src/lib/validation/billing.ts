import { z } from "zod";

/** The billing forms' checks. Shared by the forms (instant feedback) and the server actions (the real check). Pure. */

const money = (label: string) =>
  z.string().trim().refine((v) => /^\d{1,5}(\.\d{1,2})?$/.test(v), `Enter ${label} like 75 or 75.00.`);
const optionalMoney = z.string().trim().refine((v) => v === "" || /^\d{1,5}(\.\d{1,2})?$/.test(v), "Enter an amount like 85 or 85.00, or leave it empty.");
const time = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 08:00.");
const optionalTime = z.string().trim().refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Enter a time like 18:00, or leave it empty.");
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const optionalDate = z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date, or leave it empty.");

export const billingSettingsSchema = z
  .object({
    mileageRate: z.string().trim().refine((v) => /^\d{1,2}(\.\d{1,3})?$/.test(v), "Enter the mileage rate like 0.76."),
    vendorFee: money("the vendor fee"),
    onsiteFee: money("the onsite fee"),
    defaultClientRate: money("the default client rate"),
    nonStateRoundingMinutes: z.enum(["15", "30"]),
    stateRoundingMinutes: z.enum(["1", "15", "30"]),
    businessDayStart: time,
    businessDayEnd: time,
    cancelNoticeBusinessDays: z.string().trim().refine((v) => /^\d{1,2}$/.test(v) && Number(v) <= 30, "Enter a whole number of business days (0 to 30)."),
    eveningStart: optionalTime,
    eveningEnd: optionalTime,
  })
  .refine((v) => v.businessDayStart < v.businessDayEnd, { message: "The business day must end after it starts.", path: ["businessDayEnd"] })
  .refine((v) => (v.eveningStart === "") === (v.eveningEnd === ""), { message: "Set both ends of the evening window, or neither.", path: ["eveningEnd"] })
  .refine((v) => v.eveningStart === "" || v.eveningStart !== v.eveningEnd, { message: "The evening window cannot start and end at the same time.", path: ["eveningEnd"] });
export type BillingSettingsInput = z.input<typeof billingSettingsSchema>;
export type BillingSettingsField = keyof BillingSettingsInput;

export const payPeriodSchema = z
  .object({
    id: z.string().uuid().optional(),
    start: isoDate,
    end: isoDate,
    cutoffDate: optionalDate,
    cutoffTime: time,
    payDate: optionalDate,
  })
  .refine((v) => v.start <= v.end, { message: "The period must end on or after its first day.", path: ["end"] });
export type PayPeriodInput = z.input<typeof payPeriodSchema>;

export const holidaySchema = z.object({ date: isoDate, label: z.string().trim().min(1, "Name the holiday.").max(100, "Keep the name under 100 characters.") });
export const holidayDateSchema = z.object({ date: isoDate });
export const payPeriodIdSchema = z.object({ id: z.string().uuid() });
export const holidayYearSchema = z.object({ year: z.number().int().min(2024).max(2100) });

export const clientBillingSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  rate: optionalMoney,
  roundingMinutes: z.enum(["", "15", "30"]),
});
export type ClientBillingInput = z.input<typeof clientBillingSchema>;

export const eveningRateSchema = z.object({ interpreterId: z.string().uuid(), eveningRate: optionalMoney });

export const cancellationOverrideSchema = z.object({ requestId: z.string().uuid(), value: z.enum(["auto", "billable", "not_billable"]) });
export const kingCountyOverrideSchema = z.object({ requestId: z.string().uuid(), value: z.enum(["auto", "yes", "no"]) });
