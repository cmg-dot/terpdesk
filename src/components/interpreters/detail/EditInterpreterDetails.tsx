"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/profile/formParts";
import { useInterpreterDetailsForm } from "@/hooks/useInterpreterDetailsForm";
import { MAX_CITY_CHARS } from "@/lib/validation/interpreterDetails";
import type { InterpreterDetailsInput } from "@/lib/validation/interpreterDetails";
import { MAX_CERTIFICATION_CHARS } from "@/lib/workbookImport/types";

interface Props {
  interpreterId: string;
  name: string;
  isRegistered: boolean;
  /** True when only the bulk-import placeholder is on file (the form then shows an empty email box). */
  hasPlaceholderEmail: boolean;
  initial: InterpreterDetailsInput;
}

const secondaryButton = "rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const primaryButton = "rounded-full bg-[var(--forest)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:cursor-not-allowed disabled:opacity-60";

/** Agency-only: the "Edit details" button and its dialog (email for shadow profiles, certification and city for everyone). */
export const EditInterpreterDetails = ({ interpreterId, name, isRegistered, hasPlaceholderEmail, initial }: Props) => {
  const [open, setOpen] = useState(false);
  const form = useInterpreterDetailsForm({ interpreterId, initial, emailLocked: isRegistered, onSaved: () => setOpen(false) });
  const { values, errors, message, saving } = form;

  const openDialog = () => {
    form.reset();
    setOpen(true);
  };
  const emailHint = isRegistered
    ? "They sign in with this address, so only they can change it."
    : hasPlaceholderEmail
      ? "No email on file yet. Add their real address so they can receive offers and claim their profile."
      : "Offers and the profile-claim link are sent here.";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-gray-50 sm:ml-auto"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit details
      </button>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent>
          <form onSubmit={form.submit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit details</DialogTitle>
              <DialogDescription>
                {name}. Certification is private to your agency; the interpreter never sees it.
              </DialogDescription>
            </DialogHeader>

            <Field id="edit-email" label="Email" hint={emailHint} error={errors.email}>
              <input
                id="edit-email"
                type="email"
                autoComplete="off"
                value={isRegistered ? initial.email : values.email}
                disabled={isRegistered}
                placeholder={hasPlaceholderEmail ? "name@example.com" : undefined}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "edit-email-error" : undefined}
                onChange={(e) => form.setField("email", e.target.value)}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </Field>

            <Field id="edit-certification" label="Certification" hint={`Certifications and qualifications, e.g. "CDI; NIC Advanced". Up to ${MAX_CERTIFICATION_CHARS} characters.`} error={errors.certification}>
              <textarea
                id="edit-certification"
                rows={3}
                value={values.certification}
                aria-invalid={Boolean(errors.certification)}
                aria-describedby={errors.certification ? "edit-certification-error" : undefined}
                onChange={(e) => form.setField("certification", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field id="edit-city" label="City" error={errors.city}>
              <input
                id="edit-city"
                type="text"
                maxLength={MAX_CITY_CHARS}
                autoComplete="off"
                value={values.city}
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? "edit-city-error" : undefined}
                onChange={(e) => form.setField("city", e.target.value)}
                className={inputClass}
              />
            </Field>

            {message && <p role="alert" className="text-sm font-medium text-red-700">{message}</p>}

            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className={secondaryButton}>Cancel</button>
              <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Saving…" : "Save details"}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
