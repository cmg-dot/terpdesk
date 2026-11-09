import { z } from "zod";

/** The 6-digit code from an authenticator app (spaces allowed, as apps show it "123 456"). */
export const totpCodeSchema = z
  .string()
  .max(12)
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."));

/** A 6-digit code OR a recovery code (the server tells them apart). */
export const anyCodeSchema = z.string().trim().min(6, "Enter a code.").max(40, "That code is too long.");

export const confirmEnrollmentSchema = z.object({ code: totpCodeSchema });

/** Re-confirming a sensitive change: the current password and a current code. */
export const stepUpSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(200),
  code: anyCodeSchema,
});

export type StepUpInput = z.input<typeof stepUpSchema>;
export type ConfirmEnrollmentInput = z.input<typeof confirmEnrollmentSchema>;
