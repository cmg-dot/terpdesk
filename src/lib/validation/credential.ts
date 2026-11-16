import { z } from "zod";
import type { CredentialFile } from "@/lib/validation/file";

export const CREDENTIAL_TYPES = ["Certification", "Qualification", "Training", "Insurance", "Other"] as const;
export type CredentialTypeName = (typeof CREDENTIAL_TYPES)[number];

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** A real calendar date written yyyy-mm-dd, or "" for none. */
export const optionalDate = (label: string) =>
  z.string().refine((v) => {
    if (v === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, `Enter a valid ${label}.`);

/** Shared by the "Add a credential" form (instant feedback) and the server action (the real check). */
export const credentialSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(150, "Name must be 150 characters or fewer."),
    type: z.enum(CREDENTIAL_TYPES, { errorMap: () => ({ message: "Choose a type." }) }),
    issuedBy: optionalText(150, "Issued by"),
    credentialNumber: optionalText(100, "Credential number"),
    issueDate: optionalDate("issue date"),
    expirationDate: optionalDate("expiration date"),
    notes: optionalText(1000, "Notes"),
  })
  .refine((v) => !v.issueDate || !v.expirationDate || v.expirationDate >= v.issueDate, {
    path: ["expirationDate"],
    message: "The expiration date can't be before the issue date.",
  });

export type CredentialInput = z.input<typeof credentialSchema>;
export type CredentialField = keyof CredentialInput;

/**
 * A saved credential as the browser sees it (dates stay as yyyy-mm-dd text). While active it is visible, with its supporting files,
 * to the agency staff of every agency the interpreter is on the roster of; archiving hides it.
 */
export interface MyCredential {
  isArchived: boolean;
  /** Supporting files attached to this credential (visible to the agency while the credential is active). */
  files: CredentialFile[];
  id: string;
  name: string;
  type: CredentialTypeName;
  issuedBy: string;
  credentialNumber: string;
  issueDate: string;
  expirationDate: string;
  notes: string;
}
