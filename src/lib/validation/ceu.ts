import { z } from "zod";

/**
 * What the renewal-cycle form and the CEU entry form send, and the one parse that counts for each: the browser runs it for instant
 * feedback, the server runs it again. Pure. Certifying-body rules are not encoded: the interpreter says what their body asks for.
 */

export const MAX_CYCLES = 20;
export const MAX_ENTRIES = 2000;
export const LABEL_MAX = 120;
export const TITLE_MAX = 120;
export const PROVIDER_MAX = 120;
export const MAX_CYCLE_DAYS = 3660;
export const MAX_AMOUNT = 999.99;
/** Shown under the title and provider fields. */
export const PRIVACY_HINT = "No client names or patient details";

export const CEU_UNITS = ["ceu", "hours"] as const;
export type CeuUnit = (typeof CEU_UNITS)[number];
export const UNIT_LABEL: Record<CeuUnit, string> = { ceu: "CEUs", hours: "Hours" };
export const UNIT_NOUN: Record<CeuUnit, string> = { ceu: "CEU", hours: "hr" };

/** A neutral list: no certifying body's categories are encoded. */
export const CEU_CATEGORIES = [
  "Workshop or conference", "Course or class", "Webinar", "Mentoring", "Presenting or teaching", "Reading or self-study", "Other",
] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EARLIEST = "1990-01-01";
const uuid = z.string().uuid();

export const dayNumberOf = (value: string): number => {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** True for a real calendar day written yyyy-MM-dd ("2026-02-30" is not one). */
export const isRealDay = (value: string): boolean => {
  if (!DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** An amount as typed ("0.3", "1.25", 2): more than 0, at most 999.99, two decimals at most. Null when it is not one. */
export function parseAmount(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text) && !/^\.\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= MAX_AMOUNT ? Math.round(value * 100) / 100 : null;
}

export type FieldErrors<K extends string> = Partial<Record<K | "form", string>>;
const FIX = "Please fix the highlighted fields.";

function collect<K extends string>(error: z.ZodError): FieldErrors<K> {
  const fields: FieldErrors<K> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fields[field as K]) fields[field as K] = issue.message;
  }
  return fields;
}

/* ---------- renewal cycle ---------- */

const day = (what: string) => z.string().trim().refine(isRealDay, `Enter the ${what} as a date.`);
const target = z.union([z.string(), z.number()]).default("").transform((v) => (typeof v === "number" ? String(v) : v.trim()));

export const cycleSchema = z.object({
  label: z.string().trim().min(1, "Enter a name for this cycle.").max(LABEL_MAX, `The name must be ${LABEL_MAX} characters or fewer.`),
  credentialId: z.string().trim().default("").refine((v) => v === "" || uuid.safeParse(v).success, "Choose a credential from the list."),
  cycleStart: day("start"),
  cycleEnd: day("end"),
  unit: z.string().default("ceu").refine((v) => (CEU_UNITS as readonly string[]).includes(v), "Choose CEUs or hours."),
  requiredTotal: target,
  requiredEthics: target,
  requiredPpo: target,
});

export type CycleInput = z.input<typeof cycleSchema>;
export type CycleField = keyof CycleInput;

export interface CycleValues {
  label: string;
  credentialId: string | null;
  cycleStart: string;
  cycleEnd: string;
  unit: CeuUnit;
  requiredTotal: number | null;
  requiredEthics: number | null;
  requiredPpo: number | null;
}
export type CycleParse = { ok: true; data: CycleValues } | { ok: false; error: string; fieldErrors: FieldErrors<CycleField> };

const TARGETS = [["requiredTotal", "total"], ["requiredEthics", "ethics"], ["requiredPpo", "PPO"]] as const;

/** What was typed in one field, trimmed ("" when it is missing), so the cross-field checks can run even when another field failed. */
const typed = (input: unknown, key: string): string => {
  const value = (input as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
};

/** Every problem at once: a bad name does not hide an end date before the start. */
export function parseCycle(input: unknown): CycleParse {
  const parsed = cycleSchema.safeParse(input ?? {});
  const fieldErrors: FieldErrors<CycleField> = parsed.success ? {} : collect<CycleField>(parsed.error);
  const start = typed(input, "cycleStart");
  const end = typed(input, "cycleEnd");
  if (!fieldErrors.cycleStart && !fieldErrors.cycleEnd) {
    if (dayNumberOf(end) <= dayNumberOf(start)) fieldErrors.cycleEnd = "The end must be after the start.";
    else if (dayNumberOf(end) - dayNumberOf(start) > MAX_CYCLE_DAYS) fieldErrors.cycleEnd = "A cycle can span ten years at most.";
  }
  const numbers: Record<(typeof TARGETS)[number][0], number | null> = { requiredTotal: null, requiredEthics: null, requiredPpo: null };
  for (const [key, what] of TARGETS) {
    const text = typed(input, key);
    if (text === "") continue;
    const n = parseAmount(text);
    if (n === null) fieldErrors[key] = `Enter the ${what} target as a number up to ${MAX_AMOUNT}, or leave it empty.`;
    else numbers[key] = n;
  }
  const total = numbers.requiredTotal;
  if (total !== null) {
    for (const key of ["requiredEthics", "requiredPpo"] as const) {
      const n = numbers[key];
      if (n !== null && n > total && !fieldErrors[key]) fieldErrors[key] = "This cannot be more than the total target.";
    }
  }
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, error: FIX, fieldErrors };
  const v = parsed.data;
  return {
    ok: true,
    data: { label: v.label, credentialId: v.credentialId || null, cycleStart: v.cycleStart, cycleEnd: v.cycleEnd, unit: v.unit as CeuUnit, ...numbers },
  };
}

/* ---------- CEU entry ---------- */

export const entrySchema = z.object({
  title: z.string().trim().min(1, "Enter what the training was.").max(TITLE_MAX, `The title must be ${TITLE_MAX} characters or fewer.`),
  provider: z.string().trim().max(PROVIDER_MAX, `The provider must be ${PROVIDER_MAX} characters or fewer.`).default(""),
  category: z.string().trim().default("Workshop or conference").refine((v) => (CEU_CATEGORIES as readonly string[]).includes(v), "Choose a category from the list."),
  earnedOn: day("date earned"),
  amount: z.union([z.string(), z.number()]).default("").transform((v) => (typeof v === "number" ? String(v) : v.trim())),
  unit: z.string().default("ceu").refine((v) => (CEU_UNITS as readonly string[]).includes(v), "Choose CEUs or hours."),
  cycleId: z.string().trim().default("").refine((v) => v === "" || uuid.safeParse(v).success, "Choose a cycle from the list."),
  isEthics: z.boolean().default(false),
  isPpo: z.boolean().default(false),
});

export type EntryInput = z.input<typeof entrySchema>;
export type EntryField = keyof EntryInput;

export interface EntryValues {
  title: string;
  provider: string | null;
  category: string;
  earnedOn: string;
  amount: number;
  unit: CeuUnit;
  cycleId: string | null;
  isEthics: boolean;
  isPpo: boolean;
}
export type EntryParse = { ok: true; data: EntryValues } | { ok: false; error: string; fieldErrors: FieldErrors<EntryField> };

const tomorrowUtc = (now: Date): string => new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

/** `now` is only for the "not in the future" check; a day of slack covers an interpreter whose date is ahead of UTC. */
export function parseEntry(input: unknown, now: Date = new Date()): EntryParse {
  const parsed = entrySchema.safeParse(input ?? {});
  const fieldErrors: FieldErrors<EntryField> = parsed.success ? {} : collect<EntryField>(parsed.error);
  const amount = parseAmount(typed(input, "amount"));
  if (amount === null) fieldErrors.amount = `Enter an amount above 0 and up to ${MAX_AMOUNT}, with two decimals at most.`;
  const earned = typed(input, "earnedOn");
  if (!fieldErrors.earnedOn) {
    if (earned < EARLIEST) fieldErrors.earnedOn = "That date is too far back.";
    else if (earned > tomorrowUtc(now)) fieldErrors.earnedOn = "Log a training once you have completed it, not before.";
  }
  if (!parsed.success || amount === null || Object.keys(fieldErrors).length > 0) return { ok: false, error: FIX, fieldErrors };
  const v = parsed.data;
  return {
    ok: true,
    data: {
      title: v.title, provider: v.provider || null, category: v.category, earnedOn: v.earnedOn, amount,
      unit: v.unit as CeuUnit, cycleId: v.cycleId || null, isEthics: v.isEthics, isPpo: v.isPpo,
    },
  };
}
