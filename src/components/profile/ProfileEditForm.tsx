"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { updateMyProfile } from "@/app/actions/interpreterProfile";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { PROFILE_TIME_ZONES, interpreterProfileSchema } from "@/lib/validation/interpreterProfile";
import type { InterpreterProfileField, InterpreterProfileInput, MyProfile } from "@/lib/validation/interpreterProfile";

type FieldErrors = Partial<Record<InterpreterProfileField, string>>;
type TextField = Exclude<InterpreterProfileField, "takesInPerson" | "takesVirtual">;

interface ProfileEditFormProps {
  profile: MyProfile;
  onSaved: (profile: MyProfile) => void;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-shadow focus:ring-2 focus:ring-[#0B3B32] aria-[invalid=true]:border-red-400";

const Field = ({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-[13px] font-medium text-gray-700">{label}</label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-[12px] text-red-700">{error}</p>
    ) : (
      hint && <p className="text-[12px] text-gray-500">{hint}</p>
    )}
  </div>
);

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
    <legend className="sr-only">{title}</legend>
    <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
    {children}
  </fieldset>
);

const toInput = (p: MyProfile): InterpreterProfileInput => ({
  preferredName: p.preferredName,
  photoUrl: p.photoUrl,
  shortBio: p.shortBio,
  city: p.city,
  stateOrRegion: p.stateOrRegion,
  serviceArea: p.serviceArea,
  timeZone: p.timeZone,
  takesInPerson: p.takesInPerson,
  takesVirtual: p.takesVirtual,
  workEmail: p.workEmail,
  workPhone: p.workPhone,
});

/** Edit mode of the profile Overview. The sign-in email is shown for reference only and is never sent. */
export const ProfileEditForm = ({ profile, onSaved, onCancel }: ProfileEditFormProps) => {
  const [values, setValues] = useState<InterpreterProfileInput>(() => toInput(profile));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const text = (field: TextField) => ({
    id: `profile-${field}`,
    value: values[field],
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `profile-${field}-error` : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value })),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const check = interpreterProfileSchema.safeParse(values);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = issue.path[0] as InterpreterProfileField | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = await updateMyProfile(values);
      if (result.success) {
        onSaved(result.profile);
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card title="Photo">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProfileAvatar photoUrl={values.photoUrl} name={values.preferredName || profile.fullName} />
          <div className="flex-1">
            <Field id="profile-photoUrl" label="Photo link" hint="A link to an image of you, starting with https://" error={errors.photoUrl}>
              <input type="url" inputMode="url" placeholder="https://" className={inputClass} {...text("photoUrl")} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="About you">
        <Field id="profile-preferredName" label="Preferred name" hint={`Leave blank to use ${profile.fullName || "your account name"}.`} error={errors.preferredName}>
          <input type="text" autoComplete="nickname" className={inputClass} {...text("preferredName")} />
        </Field>
        <Field id="profile-signInEmail" label="Sign-in email" hint="This is the email you sign in with. It can't be changed here.">
          <input
            id="profile-signInEmail"
            type="email"
            value={profile.signInEmail}
            readOnly
            disabled
            className={`${inputClass} cursor-not-allowed bg-gray-100 text-gray-500`}
          />
        </Field>
        <Field id="profile-shortBio" label="Short bio" hint="Up to 600 characters." error={errors.shortBio}>
          <textarea rows={4} className={inputClass} {...text("shortBio")} />
        </Field>
      </Card>

      <Card title="Where and how you work">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-city" label="City" error={errors.city}>
            <input type="text" autoComplete="address-level2" className={inputClass} {...text("city")} />
          </Field>
          <Field id="profile-stateOrRegion" label="State or region" error={errors.stateOrRegion}>
            <input type="text" autoComplete="address-level1" className={inputClass} {...text("stateOrRegion")} />
          </Field>
        </div>
        <Field id="profile-serviceArea" label="Service area" hint="For example: South Puget Sound, up to 40 miles." error={errors.serviceArea}>
          <input type="text" className={inputClass} {...text("serviceArea")} />
        </Field>
        <Field id="profile-timeZone" label="Time zone" hint="Also used by your calendar." error={errors.timeZone}>
          <select className={inputClass} {...text("timeZone")}>
            {PROFILE_TIME_ZONES.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          {(["takesInPerson", "takesVirtual"] as const).map((field) => (
            <label key={field} className="inline-flex items-center gap-2.5 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={values[field]}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 accent-[#0B3B32]"
              />
              {field === "takesInPerson" ? "I take in-person work" : "I take virtual work"}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-workEmail" label="Work email" hint="Can differ from your sign-in email." error={errors.workEmail}>
            <input type="email" autoComplete="email" className={inputClass} {...text("workEmail")} />
          </Field>
          <Field id="profile-workPhone" label="Work phone" error={errors.workPhone}>
            <input type="tel" autoComplete="tel" className={inputClass} {...text("workPhone")} />
          </Field>
        </div>
      </Card>

      {formError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{formError}</p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#0B3B32] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#082a23] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
};
