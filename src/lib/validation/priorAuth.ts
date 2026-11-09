import { z } from "zod";

export const PRIOR_AUTH_MAX = 60;

export const PRIOR_AUTH_FORMAT_MESSAGE = `Use letters and numbers only (a space or - _ / . # is fine), up to ${PRIOR_AUTH_MAX} characters.`;

/** Control characters and runs of spaces become a single space, so what is stored is one tidy line. */
const tidy = (value: string): string => value.replace(/[\u0000-\u001F\u007F\s]+/g, " ").trim();

/**
 * Shared by the Staffing box and the server action (the real check). A prior-authorization number is letters and digits, with
 * the few separators the state and the payers print in them. An empty value clears the field.
 */
export const setPriorAuthSchema = z.object({
  requestId: z.string().uuid(),
  priorAuth: z
    .string()
    .max(PRIOR_AUTH_MAX * 2)
    .transform(tidy)
    .pipe(z.string().max(PRIOR_AUTH_MAX).regex(/^[A-Za-z0-9 ._/#-]*$/)),
});

export type SetPriorAuthInput = z.input<typeof setPriorAuthSchema>;
