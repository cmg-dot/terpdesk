"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { completePasswordReset } from "@/app/actions/passwordReset";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { loginPathForRole } from "@/lib/auth/routes";
import type { AppRole } from "@/lib/auth/routes";
import { PASSWORD_RULES } from "@/lib/validation/password";

const INPUT =
  "w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";
const LABEL = "block text-xs lg:text-sm text-[var(--sage)]";
const BUTTON =
  "inline-flex w-full items-center justify-center rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)] focus:ring-offset-2 disabled:opacity-50";

/**
 * Step two: the new password, from the emailed link. Submitting is what uses the link up (a Server Action), never opening the page.
 * A second submit is refused while the first is in flight, so a double click cannot race itself into "not valid".
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(false);
  const [donePortal, setDonePortal] = useState<AppRole | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const policyMet = PASSWORD_RULES.every((rule) => rule.test(password));
  const matches = password === confirm;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !policyMet || !matches) return;
    inFlight.current = true;
    setError(null);
    setPending(true);
    try {
      const result = await completePasswordReset({ token, password });
      if (result.success) {
        setPassword("");
        setConfirm("");
        setDonePortal(result.portal);
      } else {
        setError(result.error);
        setLinkDead(Boolean(result.problem));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  if (donePortal) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Your password has been changed, and every device that was signed in has been signed out. Sign in with your new password.
        </p>
        <Link href={loginPathForRole(donePortal)} className={BUTTON}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (linkDead) {
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
        <Link href="/reset-password" className={BUTTON}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="new-password" className={LABEL}>
          New password
        </label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} className={INPUT} />
        <PasswordRequirements password={password} />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-password" className={LABEL}>
          Confirm new password
        </label>
        <PasswordInput id="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} className={INPUT} />
        {confirm && !matches && <p className="text-xs text-red-500">The passwords do not match.</p>}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending || !policyMet || !matches} className={BUTTON}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
