"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updateInterpreterDetails } from "@/app/actions/updateInterpreterDetails";
import { interpreterDetailsFieldsSchema } from "@/lib/validation/interpreterDetails";
import type { InterpreterDetailsField, InterpreterDetailsInput } from "@/lib/validation/interpreterDetails";

type FieldErrors = Partial<Record<InterpreterDetailsField, string>>;

interface Options {
  interpreterId: string;
  initial: InterpreterDetailsInput;
  /** A registered user controls their own email: it is never sent, so it can't be changed from here. */
  emailLocked: boolean;
  onSaved: () => void;
}

/** State and submit logic for the agency's "Edit details" form. The server action re-checks everything. */
export const useInterpreterDetailsForm = ({ interpreterId, initial, emailLocked, onSaved }: Options) => {
  const router = useRouter();
  const [values, setValues] = useState<InterpreterDetailsInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = useCallback((field: InterpreterDetailsField, value: string) => setValues((v) => ({ ...v, [field]: value })), []);

  /** Starts over from the saved values (each time the dialog opens). */
  const reset = useCallback(() => {
    setValues(initial);
    setErrors({});
    setMessage(null);
  }, [initial]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    const payload = { ...values, email: emailLocked ? "" : values.email };

    const check = interpreterDetailsFieldsSchema.safeParse(payload);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0] as InterpreterDetailsField | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = await updateInterpreterDetails({ interpreterId, ...payload });
      if (result.success) {
        router.refresh();
        onSaved();
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return { values, errors, message, saving, setField, reset, submit };
};
