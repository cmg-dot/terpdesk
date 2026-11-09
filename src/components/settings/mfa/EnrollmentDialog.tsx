"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { confirmMfaEnrollment, startMfaEnrollment } from "@/app/actions/mfaEnrollment";
import { RecoveryCodesPanel } from "@/components/settings/mfa/RecoveryCodesPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EnrollmentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called once the recovery codes have been saved and the dialog is done. */
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
export const EnrollmentDialog = ({ open, onClose, onEnrolled }: EnrollmentDialogProps) => {
  const [step, setStep] = useState<Step>({ name: "starting" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A new secret every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep({ name: "starting" });
    setCode("");
    setError(null);
    startMfaEnrollment()
      .then((result) => {
        if (cancelled) return;
        setStep(result.success ? { name: "scan", qrDataUrl: result.qrDataUrl, manualKey: result.manualKey } : { name: "failed", message: result.error });
      })
      .catch(() => !cancelled && setStep({ name: "failed", message: "Two-step verification could not be started. Try again in a moment." }));
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      const result = await confirmMfaEnrollment({ code });
      if (result.success) setStep({ name: "codes", codes: result.recoveryCodes });
      else setError(result.error);
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
          <DialogTitle>{step.name === "codes" ? "Save your recovery codes" : "Turn on two-step verification"}</DialogTitle>
          <DialogDescription>
            {step.name === "codes"
              ? "Two-step verification is now on. One last step."
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
                <label htmlFor="mfa-enroll-code" className="font-medium text-gray-900">
                  3. Enter the 6-digit code it shows
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
                {pending ? "Checking…" : "Verify and turn on"}
              </button>
            </div>
          </form>
        )}

        {step.name === "codes" && <RecoveryCodesPanel codes={step.codes} onDone={onEnrolled} />}
      </DialogContent>
    </Dialog>
  );
};
