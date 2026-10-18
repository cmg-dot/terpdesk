import { z } from "zod";

/**
 * The single definition of the password policy. The UI checklist and the server-side Zod schema both read
 * `PASSWORD_RULES`, so what the user sees can never drift from what is enforced.
 */
export interface PasswordRule {
  id: "length" | "number" | "special";
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "number", label: "Contains at least one number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Contains at least one special character", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

// bcrypt only uses the first 72 bytes, so longer passwords would silently be truncated.
export const PASSWORD_MAX_LENGTH = 72;

export const passwordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .superRefine((value, ctx) => {
    const failing = PASSWORD_RULES.find((rule) => !rule.test(value));
    if (failing) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Password must have: ${failing.label.toLowerCase()}.` });
  });
