"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StepUpDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (turning two-step off). */
  danger?: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null when it worked (the caller then closes the dialog). */
  onSubmit: (password: string, code: string) => Promise<string | null>;
}

const INPUT = "w-full rounded-full border-none bg-[#F4F3EF] px-5 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[var(--forest)]";
const LABEL = "mb-2 ml-2 block text-[12px] font-medium text-[var(--sage)]";

/** Re-confirms a change to two-step verification with the current password and a current code (or recovery code). */
export const StepUpDialog = ({ open, title, description, confirmLabel, danger, onClose, onSubmit }: StepUpDialogProps) => {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    // Never keep a password or code in state once the dialog is dismissed.
    setPassword("");
    setCode("");
    setError(null);
  };
  const close = (next: boolean) => {
    if (next || pending) return;
    reset();
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !password || !code.trim()) return;
    setPending(true);
    setError(null);
    try {
      const failure = await onSubmit(password, code);
      if (failure) setError(failure);
      else reset();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
      setCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <div className="space-y-5">
            <div>
              <label htmlFor="mfa-stepup-password" className={LABEL}>
                Current password
              </label>
              <PasswordInput id="mfa-stepup-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mfa-stepup-code" className={LABEL}>
                Authenticator code or recovery code
              </label>
              <input id="mfa-stepup-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" spellCheck={false} maxLength={40} disabled={pending} className={INPUT} />
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => close(false)} disabled={pending} className="w-full rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !password || !code.trim()}
              className={`w-full rounded-full px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto ${danger ? "bg-red-700 hover:bg-red-800" : "bg-[var(--forest)] hover:bg-[var(--forest-hover)]"}`}
            >
              {pending ? "Checking…" : confirmLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
