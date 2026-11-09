"use server";

import { writeAuditLog } from "@/lib/audit";
import { confirmedCaller, getMfaCaller, SIGNED_IN_ONLY } from "@/lib/mfa/caller";
import { removeDevice, renameDevice } from "@/lib/mfa/mfaStore";
import type { DeviceChangeResult } from "@/lib/mfa/types";
import { sendMfaChangedEmail } from "@/lib/mfaEmail";
import { removeDeviceSchema, renameDeviceSchema } from "@/lib/validation/mfa";
import type { RemoveDeviceInput, RenameDeviceInput } from "@/lib/validation/mfa";

/**
 * Managing the authenticator devices of a login that already has two-step on. Agency logins only. A device is only ever found
 * through the caller's own id (from the session), so a device id from another login can neither be renamed nor removed.
 */

/**
 * Removes one device. Needs the current password and a current code, like every change that weakens the account. The LAST device
 * is refused here: removing it means turning two-step off, which goes through disableMfa (and clears the recovery codes with it).
 * The recovery codes belong to the login, so removing a device leaves them alone.
 */
export async function removeMfaDevice(input: RemoveDeviceInput): Promise<DeviceChangeResult> {
  const parsed = removeDeviceSchema.safeParse(input); // before any code is spent
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter your password and a code." };
  try {
    const checked = await confirmedCaller({ password: parsed.data.password, code: parsed.data.code });
    if ("error" in checked) return { success: false, error: checked.error };
    const { caller } = checked;
    const removed = await removeDevice(caller.id, parsed.data.deviceId);
    if (!removed.ok) {
      return {
        success: false,
        error: removed.reason === "last" ? "This is your only device. Turn off two-step verification instead." : "That device was already removed. Refresh the page.",
      };
    }
    await writeAuditLog({ userId: caller.id, userEmail: caller.email, action: "mfa_device_removed", details: `device=${parsed.data.deviceId}; label=${removed.label}` });
    void sendMfaChangedEmail(caller.email, "device_removed", removed.label);
    return { success: true, label: removed.label };
  } catch {
    return { success: false, error: "The device could not be removed. Try again in a moment." };
  }
}

/** Gives a device a new name. Not a security change (no password needed), but it is signed in only and written to the audit log. */
export async function renameMfaDevice(input: RenameDeviceInput): Promise<DeviceChangeResult> {
  const caller = await getMfaCaller();
  if (!caller) return { success: false, error: SIGNED_IN_ONLY };
  const parsed = renameDeviceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
  try {
    if (!(await renameDevice(caller.id, parsed.data.deviceId, parsed.data.label))) return { success: false, error: "That device was removed. Refresh the page." };
    await writeAuditLog({ userId: caller.id, userEmail: caller.email, action: "mfa_device_renamed", details: `device=${parsed.data.deviceId}; label=${parsed.data.label}` });
    return { success: true, label: parsed.data.label };
  } catch {
    return { success: false, error: "The device could not be renamed. Try again in a moment." };
  }
}
