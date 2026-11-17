import { toCents } from "@/lib/billing/money";
import { asObject, num } from "@/lib/billing/loose";
import type { BillingSettings, ClientBilling, ClientRounding } from "@/lib/billing/types";

/** The agency's billing settings as the engine uses them, from the stored row, and a client's own terms. Pure. */

/** Kari's confirmed defaults (also the column defaults in 0013_billing.sql). */
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  mileageRateCents: 76,
  vendorFeeCents: 7500,
  onsiteFeeCents: 1000,
  defaultClientRateCents: 9500,
  nonStateRoundingMinutes: 30,
  stateRoundingMinutes: 15,
  businessDayStartMinute: 8 * 60,
  businessDayEndMinute: 17 * 60,
  cancelNoticeBusinessDays: 2,
  eveningStartMinute: null,
  eveningEndMinute: null,
};

export interface StoredSettingsRow {
  mileageRate: string;
  vendorFee: string;
  onsiteFee: string;
  defaultClientRate: string;
  nonStateRoundingMinutes: number;
  stateRoundingMinutes: number;
  businessDayStartMinute: number;
  businessDayEndMinute: number;
  cancelNoticeBusinessDays: number;
  eveningStartMinute: number | null;
  eveningEndMinute: number | null;
}

const rounding = (value: unknown): ClientRounding | null => (value === 15 || value === 30 ? value : null);

export function settingsFromRow(row: StoredSettingsRow | null | undefined): BillingSettings {
  if (!row) return DEFAULT_BILLING_SETTINGS;
  const d = DEFAULT_BILLING_SETTINGS;
  return {
    mileageRateCents: toCents(row.mileageRate) ?? d.mileageRateCents,
    vendorFeeCents: toCents(row.vendorFee) ?? d.vendorFeeCents,
    onsiteFeeCents: toCents(row.onsiteFee) ?? d.onsiteFeeCents,
    defaultClientRateCents: toCents(row.defaultClientRate) ?? d.defaultClientRateCents,
    nonStateRoundingMinutes: rounding(row.nonStateRoundingMinutes) ?? d.nonStateRoundingMinutes,
    stateRoundingMinutes: row.stateRoundingMinutes,
    businessDayStartMinute: row.businessDayStartMinute,
    businessDayEndMinute: row.businessDayEndMinute,
    cancelNoticeBusinessDays: row.cancelNoticeBusinessDays,
    eveningStartMinute: row.eveningStartMinute,
    eveningEndMinute: row.eveningEndMinute,
  };
}

/** clients.data.billing: { rate: 85, roundingMinutes: 15 }. Anything missing or unreadable falls back to the agency defaults. */
export function clientBillingOf(clientData: unknown): ClientBilling {
  const billing = asObject(asObject(clientData).billing);
  const rate = num(billing.rate);
  return { rateCents: rate !== null && rate >= 0 ? toCents(rate) : null, roundingMinutes: rounding(billing.roundingMinutes) };
}

const pad = (n: number): string => String(n).padStart(2, "0");
/** 480 -> "08:00". */
export const minuteToTime = (minute: number | null): string => (minute === null ? "" : `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`);
/** "08:00" -> 480; null for anything else. */
export function timeToMinute(text: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? minute : null;
}
/** 480 -> "8:00 AM". */
export const minuteLabel = (minute: number): string => {
  const h = Math.floor(minute / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(minute % 60)} ${h < 12 ? "AM" : "PM"}`;
};
