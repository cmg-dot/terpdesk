import { formatInTimeZone } from "date-fns-tz";
import type { SelectCeuEntry, SelectRenewalCycle } from "@/db/ceuSchema";
import { dayNumberOf } from "@/lib/validation/ceu";
import type { CeuUnit } from "@/lib/validation/ceu";
import { getIanaZone } from "@/utils/timezone";

/**
 * The CEUs & renewals tab's records as the browser sees them, the progress and countdown arithmetic, and the form values. Pure.
 * Money-like care with amounts: sums are made in hundredths so 0.1 + 0.2 is 0.3 and never 0.30000000000000004.
 */

export interface CycleView {
  id: string;
  credentialId: string | null;
  label: string;
  cycleStart: string;
  cycleEnd: string;
  unit: CeuUnit;
  requiredTotal: number | null;
  requiredEthics: number | null;
  requiredPpo: number | null;
}

export interface EntryView {
  id: string;
  cycleId: string | null;
  earnedOn: string;
  title: string;
  provider: string;
  category: string;
  amount: number;
  unit: CeuUnit;
  isEthics: boolean;
  isPpo: boolean;
  /** ISO text. */
  createdAt: string;
}

export interface CeuView {
  cycles: CycleView[];
  entries: EntryView[];
}

const num = (text: string | null): number | null => (text === null ? null : Number(text));

export const toCycleView = (row: SelectRenewalCycle): CycleView => ({
  id: row.id,
  credentialId: row.credentialId,
  label: row.label,
  cycleStart: row.cycleStart,
  cycleEnd: row.cycleEnd,
  unit: row.unit,
  requiredTotal: num(row.requiredTotal),
  requiredEthics: num(row.requiredEthics),
  requiredPpo: num(row.requiredPpo),
});

export const toEntryView = (row: SelectCeuEntry): EntryView => ({
  id: row.id,
  cycleId: row.cycleId,
  earnedOn: row.earnedOn,
  title: row.title,
  provider: row.provider ?? "",
  category: row.category,
  amount: Number(row.amount),
  unit: row.unit,
  isEthics: row.isEthics,
  isPpo: row.isPpo,
  createdAt: row.createdAt.toISOString(),
});

/* ---------- amounts ---------- */

const hundredths = (n: number): number => Math.round(n * 100);

/** 6.5 as "6.5", 8 as "8", 0.3 as "0.3". */
export const formatAmount = (n: number): string => String(Number(n.toFixed(2)));

/** "6.5 CEUs", "1 CEU", "12 hours", "1 hour". */
export function amountText(n: number, unit: CeuUnit): string {
  const one = n === 1;
  return `${formatAmount(n)} ${unit === "ceu" ? (one ? "CEU" : "CEUs") : one ? "hour" : "hours"}`;
}

/* ---------- progress ---------- */

export interface Meter {
  earned: number;
  /** Null when this target is not tracked. */
  target: number | null;
}
export interface CycleProgress {
  total: Meter;
  ethics: Meter;
  ppo: Meter;
  count: number;
}

/** What the entries assigned to a cycle add up to. An entry counts once toward the total, and toward each of its ethics and PPO flags. */
export function cycleProgress(cycle: CycleView, entries: readonly EntryView[]): CycleProgress {
  let total = 0;
  let ethics = 0;
  let ppo = 0;
  let count = 0;
  for (const e of entries) {
    if (e.cycleId !== cycle.id) continue;
    count += 1;
    total += hundredths(e.amount);
    if (e.isEthics) ethics += hundredths(e.amount);
    if (e.isPpo) ppo += hundredths(e.amount);
  }
  return {
    total: { earned: total / 100, target: cycle.requiredTotal },
    ethics: { earned: ethics / 100, target: cycle.requiredEthics },
    ppo: { earned: ppo / 100, target: cycle.requiredPpo },
    count,
  };
}

/** 0 to 100, or null when the target is not tracked. */
export const meterPercent = (m: Meter): number | null => (m.target === null || m.target <= 0 ? null : Math.min(100, Math.floor((hundredths(m.earned) / hundredths(m.target)) * 100)));
export const meterMet = (m: Meter): boolean => m.target !== null && hundredths(m.earned) >= hundredths(m.target);

/* ---------- time ---------- */

/** Today's calendar date in the interpreter's own time zone, never the server's or the browser's. */
export const todayIn = (timeZone: string, now: Date = new Date()): string => formatInTimeZone(now, getIanaZone(timeZone), "yyyy-MM-dd");

export const isActiveCycle = (cycle: Pick<CycleView, "cycleEnd">, today: string): boolean => cycle.cycleEnd >= today;

export type CountdownTier = "ended" | "30" | "60" | "90" | "180";
export interface Countdown {
  days: number;
  tier: CountdownTier;
  label: string;
  className: string;
}

const BADGE: Record<CountdownTier, string> = {
  ended: "border-red-200 bg-red-50 text-red-700",
  "30": "border-orange-300 bg-orange-50 text-orange-800",
  "60": "border-amber-200 bg-amber-50 text-amber-800",
  "90": "border-[var(--banner-edge)] bg-[var(--tint)] text-[var(--tint-ink)]",
  "180": "border-[var(--banner-edge)] bg-[var(--canvas)] text-[var(--sage)]",
};

/**
 * The badge a cycle's end date earns: at 180, 90, 60 and 30 days out, then "Ends today", then "Ended". The cycle is still open on its
 * end date and ended from the next day. Further out than 180 days there is no badge (null). This is the interpreter's own countdown;
 * the agency-facing credential badge (expiryStatus) is a separate thing and is not touched.
 */
export function renewalCountdown(cycleEnd: string, timeZone: string, now: Date = new Date()): Countdown | null {
  const days = dayNumberOf(cycleEnd) - dayNumberOf(todayIn(timeZone, now));
  if (days < 0) return { days, tier: "ended", label: "Ended", className: BADGE.ended };
  const tier: CountdownTier | null = days <= 30 ? "30" : days <= 60 ? "60" : days <= 90 ? "90" : days <= 180 ? "180" : null;
  if (!tier) return null;
  return { days, tier, label: days === 0 ? "Ends today" : days === 1 ? "Ends tomorrow" : `Ends in ${days} days`, className: BADGE[tier] };
}

/** Open cycles first (the one ending soonest on top), then ended ones (the most recent first). */
export const orderCycles = (cycles: readonly CycleView[], today: string): CycleView[] => [
  ...cycles.filter((c) => isActiveCycle(c, today)).sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd) || a.id.localeCompare(b.id)),
  ...cycles.filter((c) => !isActiveCycle(c, today)).sort((a, b) => b.cycleEnd.localeCompare(a.cycleEnd) || a.id.localeCompare(b.id)),
];

/** The cycle a new entry starts in: the only one still open, otherwise none. */
export function defaultCycleId(cycles: readonly CycleView[], today: string): string {
  const open = cycles.filter((c) => isActiveCycle(c, today));
  return open.length === 1 ? open[0].id : "";
}

/* ---------- form values (strings, as a form posts them) ---------- */

export interface CycleFormValues {
  label: string;
  credentialId: string;
  cycleStart: string;
  cycleEnd: string;
  unit: CeuUnit;
  requiredTotal: string;
  requiredEthics: string;
  requiredPpo: string;
}
export interface EntryFormValues {
  title: string;
  provider: string;
  category: string;
  earnedOn: string;
  amount: string;
  unit: CeuUnit;
  cycleId: string;
  isEthics: boolean;
  isPpo: boolean;
}

export const emptyCycleForm = (today: string): CycleFormValues => ({
  label: "", credentialId: "", cycleStart: today, cycleEnd: "", unit: "ceu", requiredTotal: "", requiredEthics: "", requiredPpo: "",
});

const text = (n: number | null): string => (n === null ? "" : formatAmount(n));
export const cycleFormValues = (c: CycleView): CycleFormValues => ({
  label: c.label, credentialId: c.credentialId ?? "", cycleStart: c.cycleStart, cycleEnd: c.cycleEnd, unit: c.unit,
  requiredTotal: text(c.requiredTotal), requiredEthics: text(c.requiredEthics), requiredPpo: text(c.requiredPpo),
});

/** A new entry starts in the only open cycle (with that cycle's unit), or with none. */
export function emptyEntryForm(cycles: readonly CycleView[], today: string): EntryFormValues {
  const cycleId = defaultCycleId(cycles, today);
  const unit = cycles.find((c) => c.id === cycleId)?.unit ?? "ceu";
  return { title: "", provider: "", category: "Workshop or conference", earnedOn: today, amount: "", unit, cycleId, isEthics: false, isPpo: false };
}

export const entryFormValues = (e: EntryView): EntryFormValues => ({
  title: e.title, provider: e.provider, category: e.category, earnedOn: e.earnedOn, amount: formatAmount(e.amount), unit: e.unit,
  cycleId: e.cycleId ?? "", isEthics: e.isEthics, isPpo: e.isPpo,
});
