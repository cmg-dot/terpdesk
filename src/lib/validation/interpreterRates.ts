import { z } from "zod";

/** Dollars per hour: up to 5 digits and 2 decimals ("55", "55.5", "55.50"). Empty = not set. */
const rate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,5}(\.\d{1,2})?$/.test(v), "Enter an amount like 55 or 55.50.");

/** Shared by the rates form (instant feedback) and the server action (the real check). */
export const interpreterRatesFieldsSchema = z.object({ stateRate: rate, nonStateRate: rate });

export const updateInterpreterRatesSchema = interpreterRatesFieldsSchema.extend({ interpreterId: z.string().uuid() });

export type InterpreterRatesInput = z.input<typeof interpreterRatesFieldsSchema>;
export type InterpreterRatesField = keyof InterpreterRatesInput;

/** A stored rate (numeric text such as "55.00") or null, as the form's text. */
export const rateToText = (value: string | null | undefined): string => value ?? "";
