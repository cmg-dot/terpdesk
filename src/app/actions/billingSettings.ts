"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agencyBillingSettings, agencyHolidays, agencyPayPeriods } from "@/db/billingSchema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { writeAuditLog } from "@/lib/audit";
import { billingStaff, fieldErrorsOf, writeFailed } from "@/lib/billing/actionGuard";
import type { BillingActionResult } from "@/lib/billing/actionGuard";
import { BUSINESS_ZONE } from "@/lib/billing/businessCalendar";
import { waStateHolidays } from "@/lib/billing/holidays";
import { timeToMinute } from "@/lib/billing/settings";
import { billingSettingsSchema, holidayDateSchema, holidaySchema, holidayYearSchema, payPeriodIdSchema, payPeriodSchema } from "@/lib/validation/billing";
import type { BillingSettingsInput, PayPeriodInput } from "@/lib/validation/billing";
import { wallClockToUtc } from "@/utils/timezone";

/**
 * Billing > Rates & rules: the agency's billing settings, its semi-monthly pay schedule and its holidays. Agency staff only, and only
 * where billing is switched on. Every change is audited with ids and values that are not personal. Staff accounts have no agency of
 * their own yet, so the workspace's single agency is used.
 */

const AGENCY = DEFAULT_AGENCY_ID;

const done = async (userId: string, email: string | null | undefined, action: string, details: string): Promise<BillingActionResult> => {
  await writeAuditLog({ userId, userEmail: email ?? null, action, details });
  revalidatePath("/billing");
  return { success: true };
};

export async function saveBillingSettings(input: BillingSettingsInput): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = billingSettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const v = parsed.data;
  const values = {
    mileageRate: Number(v.mileageRate).toFixed(3),
    vendorFee: Number(v.vendorFee).toFixed(2),
    onsiteFee: Number(v.onsiteFee).toFixed(2),
    defaultClientRate: Number(v.defaultClientRate).toFixed(2),
    nonStateRoundingMinutes: Number(v.nonStateRoundingMinutes),
    stateRoundingMinutes: Number(v.stateRoundingMinutes),
    businessDayStartMinute: timeToMinute(v.businessDayStart) ?? 480,
    businessDayEndMinute: timeToMinute(v.businessDayEnd) ?? 1020,
    cancelNoticeBusinessDays: Number(v.cancelNoticeBusinessDays),
    eveningStartMinute: v.eveningStart ? timeToMinute(v.eveningStart) : null,
    eveningEndMinute: v.eveningEnd ? timeToMinute(v.eveningEnd) : null,
    updatedAt: new Date(),
    updatedBy: staff.session.user.id,
  };
  try {
    await db.insert(agencyBillingSettings).values({ agencyId: AGENCY, ...values }).onConflictDoUpdate({ target: agencyBillingSettings.agencyId, set: values });
  } catch (error) {
    return writeFailed("saveBillingSettings", error);
  }
  const { updatedAt: _at, updatedBy: _by, ...logged } = values;
  return done(staff.session.user.id, staff.session.user.email, "billing_settings_updated", Object.entries(logged).map(([k, val]) => `${k}=${val ?? "none"}`).join("; "));
}

export async function savePayPeriod(input: PayPeriodInput): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = payPeriodSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const v = parsed.data;
  // The invoice cutoff is a time on the agency's own clock (noon Pacific by default).
  const cutoffAt = v.cutoffDate ? new Date(wallClockToUtc(`${v.cutoffDate}T${v.cutoffTime}:00`, BUSINESS_ZONE)) : null;
  const values = { periodStart: v.start, periodEnd: v.end, cutoffAt, payDate: v.payDate || null };
  try {
    if (v.id) {
      const [row] = await db.update(agencyPayPeriods).set(values).where(and(eq(agencyPayPeriods.id, v.id), eq(agencyPayPeriods.agencyId, AGENCY))).returning({ id: agencyPayPeriods.id });
      if (!row) return { success: false, error: "That pay period no longer exists." };
    } else {
      await db.insert(agencyPayPeriods).values({ agencyId: AGENCY, ...values });
    }
  } catch (error) {
    if ((error as { code?: string; cause?: { code?: string } }).cause?.code === "23505" || (error as { code?: string }).code === "23505") {
      return { success: false, error: "Another pay period already starts on that date.", fieldErrors: { start: "Another pay period already starts on that date." } };
    }
    return writeFailed("savePayPeriod", error);
  }
  return done(staff.session.user.id, staff.session.user.email, "billing_pay_period_saved", `start=${v.start}; end=${v.end}; cutoff=${cutoffAt?.toISOString() ?? "none"}; payDate=${v.payDate || "none"}`);
}

export async function deletePayPeriod(input: { id: string }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = payPeriodIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That pay period could not be found." };
  try {
    await db.delete(agencyPayPeriods).where(and(eq(agencyPayPeriods.id, parsed.data.id), eq(agencyPayPeriods.agencyId, AGENCY)));
  } catch (error) {
    return writeFailed("deletePayPeriod", error);
  }
  return done(staff.session.user.id, staff.session.user.email, "billing_pay_period_deleted", `id=${parsed.data.id}`);
}

export async function addHoliday(input: { date: string; label: string }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  try {
    await db
      .insert(agencyHolidays)
      .values({ agencyId: AGENCY, holidayDate: parsed.data.date, label: parsed.data.label })
      .onConflictDoUpdate({ target: [agencyHolidays.agencyId, agencyHolidays.holidayDate], set: { label: parsed.data.label } });
  } catch (error) {
    return writeFailed("addHoliday", error);
  }
  return done(staff.session.user.id, staff.session.user.email, "billing_holiday_saved", `date=${parsed.data.date}`);
}

export async function removeHoliday(input: { date: string }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = holidayDateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "That holiday could not be found." };
  try {
    await db.delete(agencyHolidays).where(and(eq(agencyHolidays.agencyId, AGENCY), eq(agencyHolidays.holidayDate, parsed.data.date)));
  } catch (error) {
    return writeFailed("removeHoliday", error);
  }
  return done(staff.session.user.id, staff.session.user.email, "billing_holiday_removed", `date=${parsed.data.date}`);
}

/** Adds a year's WA state holidays (observed dates); days already on the list keep their own names. */
export async function addStateHolidays(input: { year: number }): Promise<BillingActionResult> {
  const staff = await billingStaff();
  if (!staff.ok) return staff.result;
  const parsed = holidayYearSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick a year from 2024 on." };
  const list = waStateHolidays(parsed.data.year);
  try {
    await db.insert(agencyHolidays).values(list.map((h) => ({ agencyId: AGENCY, holidayDate: h.date, label: h.label }))).onConflictDoNothing();
  } catch (error) {
    return writeFailed("addStateHolidays", error);
  }
  return done(staff.session.user.id, staff.session.user.email, "billing_holidays_added", `year=${parsed.data.year}; count=${list.length}`);
}
