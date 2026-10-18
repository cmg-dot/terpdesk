import { z } from "zod";
import { passwordSchema } from "@/lib/validation/password";

/** Shared by the registration form (instant feedback) and the server action (the real check). */
export const registerInterpreterSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100, "That name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(255),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(20, "Enter a valid phone number.")
    .regex(/^[0-9+()\-.\s]+$/, "Use digits, spaces and + ( ) - . only."),
  password: passwordSchema,
});

export type RegisterInterpreterInput = z.input<typeof registerInterpreterSchema>;
