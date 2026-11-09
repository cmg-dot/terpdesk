/** What the Settings card and the sign-in form share with the server actions. Client-safe: types only. */

export interface MfaStatus {
  /** MFA_ENABLED is not "false". When false the whole Settings card is hidden. */
  featureEnabled: boolean;
  /** The server has a usable encryption key (and the tables), so enrolment can work. */
  configured: boolean;
  enrolled: boolean;
  /** When two-step was confirmed (ISO), or null. */
  enrolledAt: string | null;
  recoveryCodesLeft: number;
}

export type MfaFailure = { success: false; error: string };
export type StartEnrollmentResult = { success: true; qrDataUrl: string; manualKey: string } | MfaFailure;
/** `recoveryCodes` are shown once, formatted XXXX-XXXX-XXXX-XXXX; the server keeps only their hashes. */
export type RecoveryCodesResult = { success: true; recoveryCodes: string[] } | MfaFailure;
export type DisableResult = { success: true } | MfaFailure;
