"use client";

import { useState } from "react";
import { SubmitLabel } from "@/components/auth/SubmitLabel";
import type { ReactNode } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AgreementNotice } from "@/components/legal/LegalLinks";
import { IdleNotice } from "@/components/auth/IdleNotice";
import { useMascotMood, useSetMascotMood } from "@/components/auth/LoginMascotContext";
import { HINT_MOODS } from "@/lib/mascotPoses";
import type { MascotMood } from "@/lib/mascotPoses";
import type { LoginFormValues } from "@/hooks/useLoginFlow";

interface LoginCredentialsStepProps {
  register: UseFormRegister<LoginFormValues>;
  errors: FieldErrors<LoginFormValues>;
  isSubmitting: boolean;
  justRegistered: boolean;
  verifySent: boolean;
  /** Signed in: the button says welcome while the workspace opens. */
  welcomed: boolean;
  /** The form's error box, shown above the button. */
  error: ReactNode;
}

const INPUT =
  "w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";
const LABEL = "block text-xs lg:text-sm text-[var(--sage)]";

/**
 * The first sign-in step: email and password. Focusing a field tells the owl (it glances at the email, covers its eyes for the
 * password, and peeks with one eye while the password is shown); typing again after a refusal clears its speech bubble.
 */
export const LoginCredentialsStep = ({ register, errors, isSubmitting, justRegistered, verifySent, welcomed, error }: LoginCredentialsStepProps) => {
  const setMood = useSetMascotMood();
  const mood = useMascotMood();
  const email = register("email");
  const password = register("password");
  // Focus and blur move the owl only while it has nothing to say; editing a field always clears its speech bubble.
  const follow = (next: MascotMood) => {
    if (!HINT_MOODS.has(mood)) setMood(next);
  };
  // While the password is shown, the owl peeks at the field with one eye instead of covering both.
  const [revealed, setRevealed] = useState(false);
  const passwordMood: MascotMood = revealed ? "passwordPeek" : "password";

  return (
    <div className="space-y-4">
      <IdleNotice />
      {justRegistered && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-2.5 text-xs text-green-800">
          Account created successfully. Please log in.
          {verifySent && " We emailed you a link to verify your address and connect your existing interpreter profile. Until you verify, you will not see your agencies' offers."}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="email" className={LABEL}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          {...email}
          onFocus={() => follow("email")}
          onBlur={(e) => {
            follow("idle");
            return email.onBlur(e);
          }}
          onChange={(e) => {
            setMood("email");
            return email.onChange(e);
          }}
          className={INPUT}
        />
        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
      </div>

      {/* The field (input and its show/hide button) counts as one: moving between the two keeps the owl's eyes covered. */}
      <div
        className="space-y-1"
        onFocus={() => follow(passwordMood)}
        onBlur={(e) => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) follow("idle");
        }}
      >
        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          disabled={isSubmitting}
          {...password}
          onChange={(e) => {
            setMood(passwordMood);
            return password.onChange(e);
          }}
          onVisibilityChange={(visible) => {
            setRevealed(visible);
            follow(visible ? "passwordPeek" : "password");
          }}
          className={INPUT}
        />
        {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
      </div>

      {error}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)] focus:ring-offset-2 ${welcomed ? "disabled:opacity-100" : "disabled:opacity-50"}`}
        >
          <SubmitLabel welcomed={welcomed} busy={isSubmitting} idle="Sign in" />
        </button>
        <AgreementNotice className="mt-3" />
      </div>
    </div>
  );
};
