"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { changePassword } from "@/app/actions/changePassword";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PASSWORD_RULES } from "@/lib/validation/password";

const inputClass =
  "w-full bg-[#F4F3EF] border-none rounded-full px-5 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-[#0B3B32] outline-none";
const labelClass = "block text-[12px] font-medium text-[var(--sage)] mb-2 ml-2";

export const ChangePasswordDialog = ({ triggerClassName }: { triggerClassName?: string }) => {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const policyMet = PASSWORD_RULES.every((rule) => rule.test(newPassword));

  const onOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      // Never keep passwords around in state once the dialog is dismissed.
      setCurrentPassword("");
      setNewPassword("");
      setError(null);
      setDone(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending || !currentPassword || !policyMet) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await changePassword({ currentPassword, newPassword });
      if (result.success) {
        setDone(true);
        setCurrentPassword("");
        setNewPassword("");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={triggerClassName}>Change my password</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change my password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              Your password has been changed.
            </p>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm font-medium text-white bg-[var(--forest)] hover:opacity-90"
              >
                Done
              </button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-5">
              <div>
                <label htmlFor="currentPassword" className={labelClass}>
                  Current password
                </label>
                <PasswordInput
                  id="currentPassword"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="newPassword" className={labelClass}>
                  New password
                </label>
                <PasswordInput
                  id="newPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
                <PasswordRequirements password={newPassword} />
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !currentPassword || !policyMet}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full text-sm font-medium text-white bg-[var(--forest)] hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Change password"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
