"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { SubmitLabel } from "@/components/auth/SubmitLabel";
import { useSetMascotMood } from "@/components/auth/LoginMascotContext";

interface LoginMfaStepProps {
  registration: UseFormRegisterReturn;
  email: string;
  recovery: boolean;
  isSubmitting: boolean;
  /** Signed in: the button says welcome while the workspace opens. */
  welcomed: boolean;
  /** The form's error box, shown above the button. */
  error: ReactNode;
  focusCode: () => void;
  onToggleRecovery: () => void;
  onBack: () => void;
}

/**
 * The second sign-in step, for accounts with two-step verification on: its own card in place of the email and password, with the
 * code input focused, a way to use a recovery code instead, and a way back to the first step.
 */
export const LoginMfaStep = ({ registration, email, recovery, isSubmitting, welcomed, error, focusCode, onToggleRecovery, onBack }: LoginMfaStepProps) => {
  // The input mounts once the email step has slid away; focus it then, so the code can be typed (or pasted) at once.
  useEffect(() => {
    focusCode();
  }, [focusCode]);
  // Typing again after a wrong code turns the owl's card back to green and clears its bubble.
  const setMood = useSetMascotMood();
  const code: UseFormRegisterReturn = {
    ...registration,
    onChange: (e) => {
      setMood("mfa");
      return registration.onChange(e);
    },
  };

  return (
    <div className="space-y-4 text-center" data-mfa-step>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--mint)] ring-1 ring-[var(--mint-edge)]">
        <ShieldCheck className="h-7 w-7 text-[var(--mint-line)]" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">Two-step verification</h2>
        <p className="mt-1 text-xs lg:text-sm leading-relaxed text-[var(--sage)]">
          {recovery ? "Enter one of your saved recovery codes" : "Enter the 6-digit code from your authenticator app"}
        </p>
        {email && <p className="mt-1 truncate text-xs text-[var(--sage)]">Signing in as <span className="font-medium text-[var(--ink)]">{email}</span></p>}
      </div>

      <MfaCodeField registration={code} recovery={recovery} disabled={isSubmitting} />

      {error}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)] focus:ring-offset-2 ${welcomed ? "disabled:opacity-100" : "disabled:opacity-50"}`}
      >
        <SubmitLabel welcomed={welcomed} busy={isSubmitting} idle="Verify and sign in" />
      </button>

      <div className="flex flex-col items-center gap-2.5 text-xs lg:text-sm">
        <button type="button" onClick={onToggleRecovery} disabled={isSubmitting} className="font-medium text-[var(--forest)] underline underline-offset-4 disabled:opacity-50">
          {recovery ? "Use my authenticator app instead" : "Use a recovery code instead"}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[var(--sage)] transition-colors hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--forest-rgb)/0.4)] disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to sign-in
        </button>
      </div>
    </div>
  );
};
