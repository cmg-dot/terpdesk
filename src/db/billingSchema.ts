import { date, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { interpreters } from "@/db/schema";

/**
 * The Phase 6 billing tables (migrations/manual/0013_billing.sql). Kept out of schema.ts on purpose: only /billing reads them
 * (src/lib/billing/store.ts), so a database without the migration (production, until Kari and Josie sign off) is untouched by
 * every other page, and /billing itself says it is not set up yet.
 */

export const agencyBillingSettings = pgTable("agency_billing_settings", {
  agencyId: text("agency_id").primaryKey(),
  mileageRate: numeric("mileage_rate", { precision: 6, scale: 3 }).notNull(),
  vendorFee: numeric("vendor_fee", { precision: 8, scale: 2 }).notNull(),
  onsiteFee: numeric("onsite_fee", { precision: 8, scale: 2 }).notNull(),
  defaultClientRate: numeric("default_client_rate", { precision: 8, scale: 2 }).notNull(),
  nonStateRoundingMinutes: smallint("non_state_rounding_minutes").notNull(),
  stateRoundingMinutes: smallint("state_rounding_minutes").notNull(),
  businessDayStartMinute: smallint("business_day_start_minute").notNull(),
  businessDayEndMinute: smallint("business_day_end_minute").notNull(),
  cancelNoticeBusinessDays: smallint("cancel_notice_business_days").notNull(),
  eveningStartMinute: smallint("evening_start_minute"),
  eveningEndMinute: smallint("evening_end_minute"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by"),
});

export const agencyPayPeriods = pgTable("agency_pay_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: text("agency_id").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  cutoffAt: timestamp("cutoff_at", { withTimezone: true }),
  payDate: date("pay_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  agencyStartIdx: uniqueIndex("agency_pay_periods_agency_start_idx").on(t.agencyId, t.periodStart),
}));

export const agencyHolidays = pgTable("agency_holidays", {
  agencyId: text("agency_id").notNull(),
  holidayDate: date("holiday_date", { mode: "string" }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.agencyId, t.holidayDate] }),
}));

export const agencyInterpreterBilling = pgTable("agency_interpreter_billing", {
  agencyId: text("agency_id").notNull(),
  interpreterId: uuid("interpreter_id").notNull().references(() => interpreters.id, { onDelete: "cascade" }),
  eveningRate: numeric("evening_rate", { precision: 8, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.agencyId, t.interpreterId] }),
}));
