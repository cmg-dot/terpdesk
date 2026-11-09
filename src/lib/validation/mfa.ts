import { z } from "zod";

/** The 6-digit code from an authenticator app (spaces allowed, as apps show it "123 456"). */
export const totpCodeSchema = z
  .string()
  .max(12)
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."));

/** A 6-digit code OR a recovery code (the server tells them apart). */
export const anyCodeSchema = z.string().trim().min(6, "Enter a code.").max(40, "That code is too long.");

/** A person's own name for a device ("Work phone"). Shown as plain text only; control characters are refused. */
export const DEVICE_LABEL_MAX = 50;
const labelBase = z
  .string()
  .trim()
  .max(DEVICE_LABEL_MAX, `Keep the name to ${DEVICE_LABEL_MAX} characters or fewer.`)
  .regex(/^[^\u0000-\u001F\u007F]*$/, "The name can't contain special characters.");
export const deviceLabelSchema = labelBase.min(1, "Give the device a name.");
/** On enrolment a blank name falls back to a default instead of blocking the setup. */
export const optionalDeviceLabelSchema = labelBase.optional();

export const confirmEnrollmentSchema = z.object({ code: totpCodeSchema, label: optionalDeviceLabelSchema });

/** Re-confirming a sensitive change: the current password and a current code. */
export const stepUpSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(200),
  code: anyCodeSchema,
});

export const removeDeviceSchema = stepUpSchema.extend({ deviceId: z.string().uuid() });
export const renameDeviceSchema = z.object({ deviceId: z.string().uuid(), label: deviceLabelSchema });

export type StepUpInput = z.input<typeof stepUpSchema>;
export type ConfirmEnrollmentInput = z.input<typeof confirmEnrollmentSchema>;
export type RemoveDeviceInput = z.input<typeof removeDeviceSchema>;
export type RenameDeviceInput = z.input<typeof renameDeviceSchema>;
