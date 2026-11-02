import { z } from "zod";
import { isPlaceholderEmail } from "@/lib/placeholderEmail";
import { MAX_CERTIFICATION_CHARS } from "@/lib/workbookImport/types";

/** Control characters and runs of spaces collapse to one space, so pasted text can't carry hidden characters. */
const tidy = (value: string): string => value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();

export const MAX_CITY_CHARS = 100;

const emailParser = z.string().email();

/**
 * What an agency can change about an interpreter. Shared by the form (instant feedback) and the server action (the
 * real check). An empty email means "leave it as it is": the form leaves it empty when there is none on file yet, or
 * when the interpreter is a registered user who controls their own email.
 */
export const interpreterDetailsFieldsSchema = z.object({
  email: z
    .string()
    .transform(tidy)
    .pipe(
      z
        .string()
        .max(254, "That email is too long.")
        .refine((v) => v === "" || emailParser.safeParse(v).success, "Enter a valid email address.")
        .refine((v) => !isPlaceholderEmail(v), "Enter a real email address."),
    )
    .transform((v) => v.toLowerCase()),
  certification: z.string().transform(tidy).pipe(z.string().max(MAX_CERTIFICATION_CHARS, `Keep this under ${MAX_CERTIFICATION_CHARS} characters.`)),
  city: z.string().transform(tidy).pipe(z.string().max(MAX_CITY_CHARS, `Keep this under ${MAX_CITY_CHARS} characters.`)),
});

export const updateInterpreterDetailsSchema = interpreterDetailsFieldsSchema.extend({ interpreterId: z.string().uuid() });

export type InterpreterDetailsInput = z.input<typeof interpreterDetailsFieldsSchema>;
export type InterpreterDetailsField = keyof InterpreterDetailsInput;
