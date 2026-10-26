"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { signOut } from "next-auth/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignOutActions } from "@/components/auth/SignOutActions";
import { SIGN_OUT_TEXT, SIGN_OUT_TITLE } from "@/lib/auth/messages";

/**
 * "Sign out" link/button. Asks for confirmation in a light-mode modal that matches the rest of the app, then signs
 * out and returns to the sign-in page. (This replaces NextAuth's built-in "Are you sure you want to sign out?" page,
 * which was unstyled: see also /signout.)
 */
export const SignOutButton = ({ className, children }: { className?: string; children?: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? "Sign out"}
      </button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{SIGN_OUT_TITLE}</DialogTitle>
            <DialogDescription>{SIGN_OUT_TEXT}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SignOutActions onCancel={() => setOpen(false)} onConfirm={confirm} busy={busy} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
