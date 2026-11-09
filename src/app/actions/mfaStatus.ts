"use server";

import { requireRole } from "@/lib/auth/guards";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { countRecoveryCodesLeft, getMfa } from "@/lib/mfa/mfaStore";
import type { MfaStatus } from "@/lib/mfa/types";

const OFF: MfaStatus = { featureEnabled: false, configured: false, enrolled: false, enrolledAt: null, recoveryCodesLeft: 0 };

/** What the Settings card shows for the signed-in agency login. Reads only their own row (the id comes from the session). */
export async function getMfaStatus(): Promise<MfaStatus> {
  let userId: string;
  try {
    userId = (await requireRole("agency")).user.id;
  } catch {
    return OFF;
  }
  const featureEnabled = mfaFeatureEnabled();
  const keyReady = mfaConfigured();
  try {
    const row = await getMfa(userId);
    const enrolled = Boolean(row?.confirmedAt);
    return {
      featureEnabled,
      configured: keyReady,
      enrolled,
      enrolledAt: row?.confirmedAt ? row.confirmedAt.toISOString() : null,
      recoveryCodesLeft: enrolled ? await countRecoveryCodesLeft(userId) : 0,
    };
  } catch {
    // The tables could not be read (not created yet): the card says it is not set up instead of failing.
    return { ...OFF, featureEnabled };
  }
}
