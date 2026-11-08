import { z } from "zod";

export const CLIENT_NAME_MAX = 120;

/** Control characters and runs of spaces become a single space, so what is stored is one tidy line. */
const tidy = (value: string): string => value.replace(/[\u0000-\u001F\u007F\s]+/g, " ").trim();

/** Shared by the Staffing box and the server action (the real check). An empty name clears the field. */
export const setClientNameSchema = z.object({
  requestId: z.string().uuid(),
  clientName: z.string().max(CLIENT_NAME_MAX * 2).transform(tidy).pipe(z.string().max(CLIENT_NAME_MAX)),
});

export type SetClientNameInput = z.input<typeof setClientNameSchema>;
