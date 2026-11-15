"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { requestPasswordReset } from "@/app/actions/passwordReset";

const INPUT =
  "w-full rounded-full bg-neutral-100 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-neutral-200 focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.2)]";
const LABEL = "block text-xs lg:text-sm text-[var(--sage)]";
const BUTTON =
  "inline-flex w-full items-center justify-center rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--forest-hover)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--forest-rgb)/0.5)] focus:ring-offset-2 disabled:opacity-50";

/**
 * Step one of a password reset: the address to email a link to. The answer is the same whether or not the address has an account,
 * so the confirmation never says "we found you".
 */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !email.trim()) return;
    setError(null);
    setPending(true);
    try {
      const result = await requestPasswordReset({ email });
      if (result.success) setSent(true);
      else setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
        If an account exists for that email, we have sent it a link to choose a new password. The link expires in 60 minutes. Check
        your spam folder if it does not arrive in a few minutes.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="reset-email" className={LABEL}>
          Email
        </label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          className={INPUT}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending || !email.trim()} className={BUTTON}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
