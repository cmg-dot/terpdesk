"use server";

import { requireRole } from "@/lib/auth/guards";
import { mfaConfigured, mfaFeatureEnabled } from "@/lib/mfa/config";
import { MAX_DEVICES, countRecoveryCodesLeft, listConfirmedDevices } from "@/lib/mfa/mfaStore";
import type { MfaStatus } from "@/lib/mfa/types";

const OFF: MfaStatus = { featureEnabled: false, configured: false, enrolled: false, enrolledAt: null, recoveryCodesLeft: 0, devices: [], maxDevices: MAX_DEVICES };

/** What the Settings card shows for the signed-in agency login. Reads only their own devices (the id comes from the session). */
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
    // Listed in the order they were added, so the list does not reshuffle each time a device is used.
    const devices = (await listConfirmedDevices(userId))
      .map((d) => ({ id: d.id, label: d.label, addedAt: (d.confirmedAt ?? d.createdAt).toISOString(), lastUsedAt: d.lastUsedAt ? d.lastUsedAt.toISOString() : null }))
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    return {
      featureEnabled,
      configured: keyReady,
      enrolled: devices.length > 0,
      enrolledAt: devices[0]?.addedAt ?? null,
      recoveryCodesLeft: devices.length > 0 ? await countRecoveryCodesLeft(userId) : 0,
      devices,
      maxDevices: MAX_DEVICES,
    };
  } catch {
    // The tables could not be read (not created yet): the card says it is not set up instead of failing.
    return { ...OFF, featureEnabled };
  }
}
