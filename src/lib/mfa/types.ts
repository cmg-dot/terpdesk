/** What the Settings card and the sign-in form share with the server actions. Client-safe: types only. */

/** One authenticator device, as the Settings list shows it. Never carries the secret. */
export interface MfaDeviceInfo {
  id: string;
  label: string;
  /** When it was confirmed (ISO). */
  addedAt: string;
  /** When it last signed someone in (ISO), or null = never used since it was added. */
  lastUsedAt: string | null;
}

export interface MfaStatus {
  /** MFA_ENABLED is not "false". When false the whole Settings card is hidden. */
  featureEnabled: boolean;
  /** The server has a usable encryption key (and the tables), so enrolment can work. */
  configured: boolean;
  /** True when at least one confirmed device exists: that is the only definition of "two-step is on". */
  enrolled: boolean;
  /** When the first device was added (ISO), or null. */
  enrolledAt: string | null;
  recoveryCodesLeft: number;
  /** The confirmed devices, most recently used first. */
  devices: MfaDeviceInfo[];
  /** How many devices a login may have. */
  maxDevices: number;
}

export type MfaFailure = { success: false; error: string };
export type StartEnrollmentResult = { success: true; qrDataUrl: string; manualKey: string } | MfaFailure;
/** `recoveryCodes` are shown once, formatted XXXX-XXXX-XXXX-XXXX; the server keeps only their hashes. */
export type RecoveryCodesResult = { success: true; recoveryCodes: string[] } | MfaFailure;
/** `recoveryCodes` is null when the device was added to a login that already had its codes (they are not shown or changed again). */
export type ConfirmEnrollmentResult = { success: true; recoveryCodes: string[] | null; deviceLabel: string } | MfaFailure;
export type DisableResult = { success: true } | MfaFailure;
export type DeviceChangeResult = { success: true; label: string } | MfaFailure;
