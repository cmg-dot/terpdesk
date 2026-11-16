"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { submitDemoPublicRequest } from "@/app/actions/demoPublicRequest";
import { useBooking } from "@/components/public/book/BookingContext";
import { FormSection } from "@/components/public/FormSection";
import { CustomSelect } from "@/components/ui/CustomSelect";

const INPUT =
  "w-full rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)] disabled:opacity-60";
const BUTTON =
  "inline-flex w-full items-center justify-center rounded-full bg-[var(--forest)] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)] focus:ring-offset-2 disabled:opacity-50";

export interface PublicRequestOptions {
  settings: readonly string[];
  formats: readonly string[];
  timeZones: readonly string[];
  /** The hidden spam-trap field's name (lib/publicIntake.ts). */
  honeypot: string;
}

type Values = Record<string, string>;

const newSubmissionId = (): string => crypto.randomUUID();

function Field({ label, name, error, children, hint }: { label: string; name: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={`book-${name}`} className="block text-xs font-medium text-[var(--sage)]">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-[var(--sage)]">{hint}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

/**
 * "Request an Interpreter" on the demo agency website, in four numbered cards. Sends the public intake fields to the demo-only server
 * action, which saves a draft for agency staff to review. The submission id makes a double click or a retry save one request, not two.
 * The Preferred interpreter field (prefInterpreter) lives in BookingContext, so the interpreter cards above can fill it in.
 */
export function PublicRequestForm({ settings, formats, timeZones, honeypot }: PublicRequestOptions) {
  const { preferred, setPreferred, requests } = useBooking();
  const initial = (): Values => ({ setting: settings[0], format: formats[0], timeZone: timeZones[0], submissionId: newSubmissionId() });
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const preferredInput = useRef<HTMLInputElement>(null);

  // A "Request <name>" click while the thank-you screen shows brings back a fresh form, with that name already filled in...
  const [seenRequests, setSeenRequests] = useState(requests);
  if (seenRequests !== requests) {
    setSeenRequests(requests);
    if (reference !== null) {
      setValues(initial());
      setErrors({});
      setFormError(null);
      setReference(null);
    }
  }
  // ...and focus moves to that field, without cutting short the scroll down to the form.
  useEffect(() => {
    if (requests > 0) preferredInput.current?.focus({ preventScroll: true });
  }, [requests]);

  const set = (name: string) => (value: string) => setValues((v) => ({ ...v, [name]: value }));
  const text = (name: string, type = "text", autoComplete?: string) => (
    <input id={`book-${name}`} type={type} autoComplete={autoComplete} value={values[name] ?? ""} onChange={(e) => set(name)(e.target.value)} disabled={pending} className={INPUT} />
  );
  const area = (name: string, rows: number) => (
    <textarea id={`book-${name}`} rows={rows} value={values[name] ?? ""} onChange={(e) => set(name)(e.target.value)} disabled={pending} className={INPUT} />
  );
  const inPerson = values.format !== "Virtual";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await submitDemoPublicRequest({ ...values, prefInterpreter: preferred });
      if (result.success) {
        setReference(result.reference);
        setErrors({});
      } else {
        setFormError(result.error);
        setErrors(Object.fromEntries((result.fields ?? []).map((f) => [f.field, f.message])));
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (reference !== null) {
    return (
      <div role="status" className="rounded-3xl border border-[var(--ev-line,#EBE8DF)] bg-white px-6 py-8 text-sm text-[var(--ink)] sm:px-8">
        <CircleCheck className="h-9 w-9 text-[var(--forest)]" aria-hidden="true" />
        <p className="mt-4 text-lg font-semibold text-[var(--forest)]">Thank you. Your request has been received.</p>
        <p className="mt-2 leading-relaxed text-[var(--sage)]">
          {reference ? `Your reference is ${reference}. ` : ""}Our scheduling team will review it and confirm an interpreter with you.
        </p>
        <button
          type="button"
          onClick={() => {
            setValues(initial());
            setPreferred("");
            setReference(null);
          }}
          className="mt-5 font-medium text-[var(--forest)] underline underline-offset-2"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormSection step={1} title="Requester" description="Who we should contact: a name or organization, and an email or phone number.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" name="requesterName" error={errors.requesterName}>{text("requesterName", "text", "name")}</Field>
          <Field label="Organization" name="requesterOrg" error={errors.requesterOrg}>{text("requesterOrg", "text", "organization")}</Field>
          <Field label="Email" name="email" error={errors.email}>{text("email", "email", "email")}</Field>
          <Field label="Phone" name="phone" error={errors.phone}>{text("phone", "tel", "tel")}</Field>
        </div>
      </FormSection>

      <FormSection step={2} title="Assignment" description="What kind of appointment it is, and anyone you would like us to ask first.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Setting" name="setting" error={errors.setting}>
            <CustomSelect ariaLabel="Setting" options={settings} value={values.setting} onChange={set("setting")} disabled={pending} />
          </Field>
          <Field label="Format" name="format" error={errors.format}>
            <CustomSelect ariaLabel="Format" options={formats} value={values.format} onChange={set("format")} disabled={pending} />
          </Field>
        </div>
        <Field label="What is the appointment for?" name="purpose" error={errors.purpose} hint="A short description is enough. Please do not include medical details.">
          {area("purpose", 3)}
        </Field>
        <Field label="Preferred interpreter (optional)" name="prefInterpreter" error={errors.prefInterpreter} hint="Choose “Request” on an interpreter above, or type a name. We confirm availability before booking.">
          <input ref={preferredInput} id="book-prefInterpreter" type="text" value={preferred} onChange={(e) => setPreferred(e.target.value)} disabled={pending} className={INPUT} />
        </Field>
      </FormSection>

      <FormSection step={3} title="Schedule & Location" description={inPerson ? "When and where the interpreter should be." : "When the session is. We send the video link details with the confirmation."}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" name="startDate" error={errors.startDate}>{text("startDate", "date")}</Field>
          <Field label="Start time" name="startTime" error={errors.startTime}>{text("startTime", "time")}</Field>
          <Field label="End time" name="endTime" error={errors.endTime}>{text("endTime", "time")}</Field>
        </div>
        <Field label="Time zone" name="timeZone" error={errors.timeZone}>
          <CustomSelect ariaLabel="Time zone" options={timeZones} value={values.timeZone} onChange={set("timeZone")} disabled={pending} />
        </Field>
        {inPerson && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue" name="venue" error={errors.venue}>{text("venue")}</Field>
            <Field label="Address" name="address" error={errors.address}>{text("address", "text", "street-address")}</Field>
          </div>
        )}
      </FormSection>

      <FormSection step={4} title="Additional Notes">
        <Field label="Communication preferences (optional)" name="commPreferences" error={errors.commPreferences}>
          {area("commPreferences", 3)}
        </Field>
      </FormSection>

      {/* Spam trap: hidden from people and from screen readers. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <input tabIndex={-1} autoComplete="off" name={honeypot} value={values[honeypot] ?? ""} onChange={(e) => set(honeypot)(e.target.value)} />
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Sending…" : "Request an interpreter"}
      </button>
    </form>
  );
}
