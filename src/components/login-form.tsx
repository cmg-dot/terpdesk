"use client";

import { useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { AppRole } from "@/lib/auth/routes";
import { useLoginFlow } from "@/hooks/useLoginFlow";
import { LoginCredentialsStep } from "@/components/auth/LoginCredentialsStep";
import { LoginMfaStep } from "@/components/auth/LoginMfaStep";
import { LoginFormError } from "@/components/auth/LoginFormError";

const EASE = [0.4, 0, 0.2, 1] as const;
/**
 * Steps slide sideways: forward to the code step, back to the email step. `direction` is 1 forward, -1 back. The travel stays
 * inside the card's padding, so nothing needs clipping (which would also clip the fields' focus rings).
 */
const STEP: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 20 * direction }),
  shown: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE } },
  leave: (direction: number) => ({ opacity: 0, x: -20 * direction, transition: { duration: 0.16, ease: EASE } }),
};
const FADE: Variants = { enter: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0 } }, leave: { opacity: 0, transition: { duration: 0 } } };

/** The sign-in form of one portal: the email and password step, then (for accounts with it on) the two-step verification card. */
export function LoginForm({ portal }: { portal: AppRole }) {
  const flow = useLoginFlow(portal);
  const reduce = Boolean(useReducedMotion());
  const {
    register,
    getValues,
    setFocus,
    formState: { errors, isSubmitting },
  } = flow.form;
  const focusCode = useCallback(() => setFocus("code"), [setFocus]);
  const error = <LoginFormError message={flow.formError} portal={portal} />;
  const direction = flow.step === "mfa" ? 1 : -1;

  return (
    <form onSubmit={flow.submit}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={flow.step} custom={direction} variants={reduce ? FADE : STEP} initial="enter" animate="shown" exit="leave">
          {flow.step === "mfa" ? (
            <LoginMfaStep
              registration={register("code")}
              email={getValues("email")}
              recovery={flow.useRecovery}
              isSubmitting={isSubmitting}
              welcomed={flow.welcomed}
              error={error}
              focusCode={focusCode}
              onToggleRecovery={flow.toggleRecovery}
              onBack={flow.backToCredentials}
            />
          ) : (
            <LoginCredentialsStep
              register={register}
              errors={errors}
              isSubmitting={isSubmitting}
              justRegistered={flow.justRegistered}
              verifySent={flow.verifySent}
              welcomed={flow.welcomed}
              error={error}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </form>
  );
}
