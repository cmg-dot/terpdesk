import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { optionalDate } from "@/lib/validation/credential";
import type { CredentialFile } from "@/lib/validation/file";
import { getIanaZone } from "@/utils/timezone";

/**
 * The two dedicated insurance policies on an interpreter's profile: Liability (expected of everyone) and Commercial Auto (optional;
 * an in-person State or Apple Health job pays +$10 with it). Staff record the commercial auto policy themselves for a profile with no
 * login (actions/staffInsurance.ts). Each is a credential row with `insurance_kind` set (one active of each kind, 0012_phase23.sql),
 * so it reuses the credential's private S3 files and is visible to the agency like every active credential. Pure (shared by the
 * browser and the server).
 */

export const INSURANCE_KINDS = ["liability", "commercial_auto"] as const;
export type InsuranceKind = (typeof INSURANCE_KINDS)[number];

export const INSURANCE_LABEL: Record<InsuranceKind, string> = {
  liability: "Liability insurance",
  commercial_auto: "Commercial auto insurance",
};

/** The badge an active, unexpired commercial auto policy earns: +$10 on in-person State (ODHH) and Apple Health (HCA) jobs, as billing pays it. */
export const COMMERCIAL_AUTO_BADGE = "Commercial Auto (+$10 in-person State/HCA)";

/** What the +$10 is for, in the interpreter's and staff's words. */
export const COMMERCIAL_AUTO_PAYOUT = "With current commercial auto coverage, in-person State (ODHH) and Apple Health (HCA) assignments pay +$10.";

/** Warn this many days before a policy expires. */
export const INSURANCE_WARNING_DAYS = 30;

export const insuranceSchema = z.object({
  kind: z.enum(INSURANCE_KINDS),
  insurer: z.string().trim().min(1, "Enter the insurance company.").max(150, "Insurer must be 150 characters or fewer."),
  policyNumber: z.string().trim().max(100, "Policy number must be 100 characters or fewer."),
  coverageLimits: z.string().trim().max(200, "Coverage limits must be 200 characters or fewer."),
  expirationDate: optionalDate("expiration date").refine((v) => v !== "", "Enter the expiration date."),
});
export type InsuranceInput = z.input<typeof insuranceSchema>;

/** Staff recording a commercial auto policy for an interpreter with no login: the expiration date is what billing needs. */
export const staffCommercialAutoSchema = z.object({
  interpreterId: z.string().uuid(),
  expirationDate: optionalDate("expiration date").refine((v) => v !== "", "Enter the expiration date."),
  coverageLimits: z.string().trim().max(200, "Coverage limits must be 200 characters or fewer."),
  insurer: z.string().trim().max(150, "Insurer must be 150 characters or fewer."),
});
export type StaffCommercialAutoInput = z.input<typeof staffCommercialAutoSchema>;
export type StaffCommercialAutoField = Exclude<keyof StaffCommercialAutoInput, "interpreterId">;
export type InsuranceField = Exclude<keyof InsuranceInput, "kind">;

export interface InsurancePolicy {
  credentialId: string;
  kind: InsuranceKind;
  insurer: string;
  policyNumber: string;
  coverageLimits: string;
  /** yyyy-MM-dd */
  expirationDate: string;
  files: CredentialFile[];
}

export type MyInsurance = Record<InsuranceKind, InsurancePolicy | null>;

export const isInsuranceKind = (value: unknown): value is InsuranceKind => (INSURANCE_KINDS as readonly unknown[]).includes(value);

/** Days from "today" in the interpreter's zone to the expiration date (negative once expired; a policy is valid on its last day). */
export function daysUntil(expirationDate: string, timeZone: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) return null;
  const day = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return day(expirationDate) - day(formatInTimeZone(now, getIanaZone(timeZone), "yyyy-MM-dd"));
}

export type InsuranceWarning = { kind: InsuranceKind; expirationDate: string; expired: boolean; days: number };

/** The policies that are expired or expire within INSURANCE_WARNING_DAYS, for the interpreter's banner. */
export function insuranceWarnings(policies: { kind: InsuranceKind; expirationDate: string }[], timeZone: string, now: Date = new Date()): InsuranceWarning[] {
  return policies.flatMap((p) => {
    const days = daysUntil(p.expirationDate, timeZone, now);
    return days !== null && days <= INSURANCE_WARNING_DAYS ? [{ kind: p.kind, expirationDate: p.expirationDate, expired: days < 0, days }] : [];
  });
}

/** An active commercial auto policy that has not expired: the in-person +$10 applies. */
export const hasValidCommercialAuto = (policy: { expirationDate: string } | null | undefined, timeZone: string, now: Date = new Date()): boolean =>
  Boolean(policy) && (daysUntil(policy?.expirationDate ?? "", timeZone, now) ?? -1) >= 0;
