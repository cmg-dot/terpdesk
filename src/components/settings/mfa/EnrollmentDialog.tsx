"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { confirmMfaEnrollment, startMfaEnrollment } from "@/app/actions/mfaEnrollment";
import { RecoveryCodesPanel } from "@/components/settings/mfa/RecoveryCodesPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEVICE_LABEL_MAX } from "@/lib/validation/mfa";

export interface StartedEnrollment {
  qrDataUrl: string;
  manualKey: string;
}

interface EnrollmentDialogProps {
  open: boolean;
  /** A setup already started (adding a later device: the password and a code were checked first). Null = start one here (the first device). */
  started: StartedEnrollment | null;
  /** What the name field starts as. */
  defaultLabel: string;
  onClose: () => void;
  /** Called once the device is added (and, for the first device, its recovery codes have been saved). */
  onEnrolled: () => void;
}

type Step =
  | { name: "starting" }
  | { name: "scan"; qrDataUrl: string; manualKey: string }
  | { name: "codes"; codes: string[] }
  | { name: "failed"; message: string };

const INPUT = "w-full rounded-full border-none bg-[#F4F3EF] px-5 py-2.5 text-center text-lg tracking-[0.3em] text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]";

/**
 * Turning two-step verification on: scan the QR code, type the first code to prove the app is set up, then save the recovery codes.
 * Until the first code is accepted nothing changes for the account, so closing this part way through is harmless.
 */
export const EnrollmentDialog = ({ open, started, defaultLabel, onClose, onEnrolled }: EnrollmentDialogProps) => {
  const [step, setStep] = useState<Step>({ name: "starting" });
  const [code, setCode] = useState("");
  const [label, setLabel] = useState(defaultLabel);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A new secret every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCode("");
    setLabel(defaultLabel);
    setError(null);
    if (started) {
      setStep({ name: "scan", qrDataUrl: started.qrDataUrl, manualKey: started.manualKey });
      return;
    }
    setStep({ name: "starting" });
    startMfaEnrollment()
      .then((result) => {
        if (cancelled) return;
        setStep(result.success ? { name: "scan", qrDataUrl: result.qrDataUrl, manualKey: result.manualKey } : { name: "failed", message: result.error });
      })
      .catch(() => !cancelled && setStep({ name: "failed", message: "Two-step verification could not be started. Try again in a moment." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh setup per opening; defaultLabel only seeds the field
  }, [open, started]);

  const close = (next: boolean) => {
    if (next || pending) return;
    if (step.name === "codes") return; // the recovery codes must be saved first (the Done button)
    onClose();
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || step.name !== "scan") return;
    setPending(true);
    setError(null);
    try {
      const result = await confirmMfaEnrollment({ code, label });
      if (!result.success) setError(result.error);
      else if (result.recoveryCodes) setStep({ name: "codes", codes: result.recoveryCodes });
      else onEnrolled(); // a later device: the recovery codes already exist and are not shown again
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
      setCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg" hideClose={step.name === "codes"}>
        <DialogHeader>
          <DialogTitle>{step.name === "codes" ? "Save your recovery codes" : started ? "Add another device" : "Turn on two-step verification"}</DialogTitle>
          <DialogDescription>
            {step.name === "codes"
              ? "Two-step verification is now on. One last step."
              : started
                ? "Any of your devices can then give the code when you sign in."
                : "You will enter a 6-digit code from an authenticator app each time you sign in."}
          </DialogDescription>
        </DialogHeader>

        {step.name === "starting" && <p className="text-sm text-gray-500">Getting your setup code…</p>}

        {step.name === "failed" && (
          <>
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {step.message}
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </>
        )}

        {step.name === "scan" && (
          <form onSubmit={verify} noValidate>
            <ol className="space-y-5 text-sm text-gray-700">
              <li>
                <p className="font-medium text-gray-900">1. Open an authenticator app</p>
                <p className="text-gray-500">Google Authenticator, 1Password, Microsoft Authenticator or Authy all work.</p>
              </li>
              <li>
                <p className="font-medium text-gray-900">2. Scan this QR code</p>
                <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={step.qrDataUrl} alt="QR code for your authenticator app" width={176} height={176} className="rounded-lg border border-gray-200" />
                  <div className="min-w-0 text-gray-500">
                    <p>Can&apos;t scan it? Enter this key by hand:</p>
                    <p data-manual-key className="mt-1 break-all rounded-lg bg-[#F4F3EF] px-3 py-2 font-mono text-[13px] tracking-wider text-gray-800">
                      {step.manualKey}
                    </p>
                  </div>
                </div>
              </li>
              <li>
                <label htmlFor="mfa-enroll-label" className="font-medium text-gray-900">
                  3. Name this device
                </label>
                <input
                  id="mfa-enroll-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={DEVICE_LABEL_MAX}
                  autoComplete="off"
                  disabled={pending}
                  placeholder="Work phone"
                  className="mt-2 w-full rounded-full border-none bg-[#F4F3EF] px-5 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]"
                />
              </li>
              <li>
                <label htmlFor="mfa-enroll-code" className="font-medium text-gray-900">
                  4. Enter the 6-digit code it shows
                </label>
                <input
                  id="mfa-enroll-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  disabled={pending}
                  className={`mt-2 ${INPUT}`}
                />
              </li>
            </ol>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} disabled={pending} className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || code.replace(/\s/g, "").length !== 6}
                className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-50"
              >
                {pending ? "Checking…" : started ? "Verify and add device" : "Verify and turn on"}
              </button>
            </div>
          </form>
        )}

        {step.name === "codes" && <RecoveryCodesPanel codes={step.codes} onDone={onEnrolled} />}
      </DialogContent>
    </Dialog>
  );
};
